"""공용 pytest fixtures.

xdist worker마다 in-memory SQLite 스키마를 한 번 만들고, 각 테스트는 외부
transaction 안의 SAVEPOINT 세션을 사용한다. 애플리케이션의 ``commit()``은
SAVEPOINT만 해제하며 테스트 종료 시 outer transaction을 rollback한다.
"""

from __future__ import annotations

import os
import sys
from collections.abc import Generator
from contextlib import AbstractContextManager, ExitStack, contextmanager
from decimal import Decimal
from functools import partial
from pathlib import Path
from typing import Any, Callable

# 5.4-C: pytest 가 실제 backend/mes.db 를 건드리지 않도록 보장.
# database.py 가 모듈 로드 시 engine = create_engine(DATABASE_URL) 을 평가하므로
# app.* import 전에 DATABASE_URL 을 in-memory 로 고정한다.
# 어떤 fixture 가 app.main 을 import 해도 default engine 이 in-memory 라 실 DB 안 건드림.
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from fastapi import Request
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Connection, Engine, Transaction
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

# tests/ 가 backend/ 하위지만, app 패키지 import 를 위해 backend 를 path 에 추가
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import Base  # noqa: E402  (path 보강 후 import)
from app import models  # noqa: F401, E402  (Base.metadata 등록을 위해 import)


_PROCESS_TYPE_SEED = [
    ("TR", "T", "R", 10), ("TA", "T", "A", 20), ("TF", "T", "F", 25),
    ("HR", "H", "R", 15), ("HA", "H", "A", 30), ("HF", "H", "F", 35),
    ("VR", "V", "R", 25), ("VA", "V", "A", 40), ("VF", "V", "F", 45),
    ("NR", "N", "R", 50), ("NA", "N", "A", 55), ("NF", "N", "F", 60),
    ("AR", "A", "R", 45), ("AA", "A", "A", 65), ("AF", "A", "F", 70),
    ("PR", "P", "R", 55), ("PA", "P", "A", 75), ("PF", "P", "F", 80),
]


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    """매 테스트마다 in-process PIN 레이트 리미터 상태 초기화.

    실패-시도 카운터가 테스트 간 누수되어 의도치 않은 429 가 나지 않도록 보장한다.
    """
    from app.services import rate_limit

    rate_limit.reset_all()
    yield
    rate_limit.reset_all()


@pytest.fixture(scope="session")
def _worker_db_engine() -> Generator[Engine, None, None]:
    """xdist worker 하나가 공유할 SQLite 스키마와 기준 데이터를 준비한다."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _configure_sqlite(dbapi_conn: Any, _connection_record: Any) -> None:
        """pysqlite 자동 BEGIN을 끄고 FK 검사를 connection 단위로 고정한다."""
        dbapi_conn.isolation_level = None
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    @event.listens_for(engine, "begin")
    def _begin_explicitly(connection: Connection) -> None:
        """Python 3.11 pysqlite에서도 SAVEPOINT 경계가 보존되게 BEGIN을 발행한다."""
        connection.exec_driver_sql("BEGIN")

    Base.metadata.create_all(bind=engine)
    from app.models import ProcessType, SystemSetting

    with Session(engine) as seed_session:
        for code, prefix, suffix, order in _PROCESS_TYPE_SEED:
            seed_session.add(
                ProcessType(code=code, prefix=prefix, suffix=suffix, stage_order=order)
            )
        seed_session.add(
            SystemSetting(
                setting_key="security.bom_auto_token_secret",
                setting_value="test-bom-auto-token-secret",
            )
        )
        seed_session.commit()

    try:
        yield engine
    finally:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@contextmanager
def _isolated_db_session(engine: Engine) -> Generator[Session, None, None]:
    """하나의 테스트를 outer transaction으로 감싸고 종료 시 전부 되돌린다."""
    with ExitStack() as cleanup:
        connection = cleanup.enter_context(engine.connect())
        outer_transaction = connection.begin()
        cleanup.callback(_rollback_if_active, outer_transaction)
        session = Session(
            bind=connection,
            autocommit=False,
            autoflush=False,
            join_transaction_mode="create_savepoint",
        )
        cleanup.callback(session.close)

        from app.utils import mes_code as _mc
        _mc.invalidate_symbol_cache()
        cleanup.callback(_mc.invalidate_symbol_cache)

        yield session


def _rollback_if_active(transaction: Transaction) -> None:
    """정리 중 앞 단계가 실패해도 살아 있는 outer transaction을 되돌린다."""
    if transaction.is_active:
        transaction.rollback()


@pytest.fixture(scope="session")
def _isolated_db_session_factory(
    _worker_db_engine: Engine,
) -> Callable[[], AbstractContextManager[Session]]:
    """실제 db_session fixture와 계약 테스트가 공유할 격리 세션 생성기다."""
    return partial(_isolated_db_session, _worker_db_engine)


@pytest.fixture()
def db_session(
    _isolated_db_session_factory: Callable[[], AbstractContextManager[Session]],
) -> Generator[Session, None, None]:
    """테스트별 outer transaction에 참여하는 SAVEPOINT 세션을 제공한다."""
    with _isolated_db_session_factory() as session:
        yield session


@pytest.fixture()
def auth_client(db_session):
    """실제 인증 dependency를 그대로 쓰는 보안·세션 계약용 TestClient."""
    from fastapi.testclient import TestClient
    from app.main import app
    from app.database import get_db

    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture()
def client(db_session):
    """기존 도메인 회귀가 actor fixture에 집중하도록 인증 경계만 대체한다.

    IC-01 자체는 ``auth_client``를 사용하는 보안 테스트에서 실제 DB cookie
    session으로 검증한다. 이 override는 테스트 앱에만 존재하며 운영 코드에는
    우회 경로를 만들지 않는다.
    """
    import uuid

    from fastapi.testclient import TestClient

    from app._actor import set_actor
    from app.database import get_db
    from app.dependencies.verified_actor import require_current_actor, require_verified_actor
    from app.main import app
    from app.models import DepartmentEnum, Employee, EmployeeLevelEnum
    from app.routers._errors import ErrorCode, http_error
    from app.services.pin_auth import hash_pin

    actor_id_keys = (
        "actor_employee_id",
        "author_employee_id",
        "requester_employee_id",
        "edited_by_employee_id",
        "employee_id",
        "recipient_employee_id",
    )
    actor_code_keys = (
        "producer_employee_code",
        "operator_employee_code",
        "employee_code",
    )

    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    async def _compat_actor(request: Request) -> Employee:
        body: dict[str, Any] = {}
        try:
            parsed = await request.json()
            if isinstance(parsed, dict):
                body = parsed
        except Exception:
            pass

        id_candidates = [
            request.headers.get("X-Actor-Employee-Id"),
            *(body.get(key) for key in actor_id_keys),
            *(request.query_params.get(key) for key in actor_id_keys),
        ]
        has_actor_claim = any(candidate for candidate in id_candidates)
        employee = None
        for candidate in id_candidates:
            if not candidate:
                continue
            try:
                employee = db_session.get(Employee, uuid.UUID(str(candidate)))
            except (TypeError, ValueError):
                employee = None
            if employee is not None:
                break

        if employee is None:
            code_candidates = [
                request.headers.get("X-MES-Employee-Code"),
                request.headers.get("X-Employee-Code"),
                *(body.get(key) for key in actor_code_keys),
            ]
            has_actor_claim = has_actor_claim or any(
                candidate for candidate in code_candidates
            )
            for candidate in code_candidates:
                if not candidate:
                    continue
                employee = (
                    db_session.query(Employee)
                    .filter(Employee.employee_code == str(candidate))
                    .first()
                )
                if employee is not None:
                    break

        if employee is None and has_actor_claim:
            raise http_error(
                403,
                ErrorCode.ACTOR_MISMATCH,
                "세션 작업자와 요청 작업자가 다릅니다.",
            )

        if employee is None:
            employee = (
                db_session.query(Employee)
                .filter(Employee.is_active == "true")
                .order_by(Employee.created_at, Employee.employee_code)
                .first()
            )
        if employee is None:
            employee = Employee(
                employee_id=uuid.uuid4(),
                employee_code="TEST-COMPAT-ACTOR",
                name="테스트 호환 작업자",
                role="테스트",
                department=DepartmentEnum.ASSEMBLY,
                level=EmployeeLevelEnum.STAFF,
                is_active=True,
                pin_hash=hash_pin("0000"),
                pin_requires_change=False,
            )
        if not bool(employee.is_active):
            raise http_error(403, ErrorCode.EMPLOYEE_INACTIVE, "비활성 직원입니다.")

        set_actor(request, employee)
        request.state.verified_actor = employee
        endpoint = request.scope.get("endpoint")
        if getattr(endpoint, "__dexcowin_lifecycle_target_employee__", False):
            raw_target = request.path_params.get("employee_id")
            try:
                target_id = uuid.UUID(str(raw_target))
            except (TypeError, ValueError):
                target_id = None
            request.state.verified_lifecycle_target_employee_id = target_id
            request.state.verified_lifecycle_target_employee = (
                db_session.get(Employee, target_id) if target_id is not None else None
            )
        return employee

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[require_verified_actor] = _compat_actor
    app.dependency_overrides[require_current_actor] = _compat_actor
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(require_current_actor, None)
    app.dependency_overrides.pop(require_verified_actor, None)
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture()
def make_item(db_session):
    """간단한 Item 생성 헬퍼. inventory 까지 함께 만들어준다."""
    from app.models import Inventory, Item, WarehouseUnplacedItem

    next_serial = 1

    def _make(*, name: str = "테스트품목", process_type_code: str = "TR",
              warehouse_qty: Decimal = Decimal("0"),
              pending: Decimal = Decimal("0"),
              model_symbol: str | None = None,
              serial_no: int | None = None) -> Item:
        # mes_code 는 생성열 — 직접 설정 불가. 분해필드(model_symbol/process_type/serial)를
        # 주면 SQLite 가 자동 계산한다. 셋 다 채워야 mes_code 가 NULL 이 아니다.
        nonlocal next_serial
        resolved_model_symbol = model_symbol or "9"
        resolved_serial_no = serial_no if serial_no is not None else next_serial
        next_serial = max(next_serial + 1, resolved_serial_no + 1)
        item = Item(
            item_name=name,
            process_type_code=process_type_code,
            unit="EA",
            model_symbol=resolved_model_symbol,
            serial_no=resolved_serial_no,
        )
        db_session.add(item)
        db_session.flush()
        inv = Inventory(
            item_id=item.item_id,
            quantity=warehouse_qty,  # 위치 합 0 이라 == warehouse_qty
            warehouse_qty=warehouse_qty,
            pending_quantity=pending,
        )
        db_session.add(inv)
        db_session.add(
            WarehouseUnplacedItem(
                item_id=item.item_id,
                quantity=warehouse_qty,
            )
        )
        db_session.flush()
        return item

    return _make


@pytest.fixture()
def make_location(db_session):
    """InventoryLocation 생성 헬퍼. quantity 자동 동기화는 별도 — 호출자가 신경 안 써도 됨."""
    from app.models import InventoryLocation, DepartmentEnum, LocationStatusEnum

    def _make(item_id, *, department: DepartmentEnum = DepartmentEnum.ASSEMBLY,
              status: LocationStatusEnum = LocationStatusEnum.PRODUCTION,
              quantity: Decimal = Decimal("0")) -> InventoryLocation:
        loc = InventoryLocation(
            item_id=item_id,
            department=department,
            status=status,
            quantity=quantity,
        )
        db_session.add(loc)
        db_session.flush()
        return loc

    return _make


@pytest.fixture()
def make_bom(db_session):
    """BOM 행 생성 헬퍼."""
    from app.models import BOM

    def _make(parent_id, child_id, qty: Decimal) -> BOM:
        row = BOM(parent_item_id=parent_id, child_item_id=child_id, quantity=qty, unit="EA")
        db_session.add(row)
        db_session.flush()
        return row

    return _make
