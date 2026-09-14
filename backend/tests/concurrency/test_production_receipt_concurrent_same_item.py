"""동시성 회귀 테스트 (WS9 / audit risk #3):

같은 부품을 소모하는 생산 입고(production receipt) 2건 경합 시:

  - 정확히 1건만 2xx, 나머지 1건은 깨끗한 4xx (422 STOCK_SHORTAGE) — 500/unhandled 아님
  - 처리 후 재고 불변식 유지 (quantity == warehouse_qty + Σ InventoryLocation)
    → services/integrity.check_inventory_consistency 재사용
  - 실패한 요청은 orphan TransactionLog 0건, 부분 배치 없음 (loser 의 쓰기 완전 롤백)

production.py receipt 경로(_explode_bom → 사전 가용성 검사 → consume_from_item_department
원자적 가드 → PRODUCE 적재)를 HTTP 계층으로 통과시킨다.

두 가지 각도로 핀:
  1) test_..._real_race — 실제 2스레드 동시 HTTP 요청 (conftest 의 파일 기반
     SQLite + BEGIN IMMEDIATE 로 writer 직렬화). SQLite 자연 동작을 핀.
  2) test_..._loser_late_value_error — pre-check 를 둘 다 통과한 뒤 loser 의
     consume_from_item_department 가 원자적 가드에서 ValueError 를 늦게 던지는 정확한
     시나리오를 결정적으로 재현. 라우터의 에러 매핑(audit 핵심)을 핀.

fixture(concurrent_engine / make_session)는 같은 디렉터리 conftest.py
(파일 기반 SQLite + NullPool + BEGIN IMMEDIATE)를 사용한다 — in-memory
StaticPool 로는 다중 연결 lock 경합이 재현되지 않으므로.
"""

from __future__ import annotations

import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.models import (
    BOM,
    DepartmentEnum,
    Inventory,
    InventoryLocation,
    Item,
    LocationStatusEnum,
    TransactionLog,
    TransactionTypeEnum,
)


def _setup(make_session, component_wh_qty: Decimal):
    """완제품 P + 부품 C (BOM: P 1개당 C 1개). C 창고 재고 = component_wh_qty."""
    session = make_session()

    parent = Item(
        item_name="동시생산_완제품", process_type_code="TF", unit="EA",
        model_symbol="9", serial_no=1,
    )
    child = Item(
        item_name="동시생산_부품", process_type_code="TR", unit="EA",
        model_symbol="9", serial_no=1,
    )
    session.add_all([parent, child])
    session.flush()

    session.add(
        BOM(
            parent_item_id=parent.item_id,
            child_item_id=child.item_id,
            quantity=Decimal("1"),
            unit="EA",
        )
    )
    # 부품 C: 창고에 정확히 1개분만 (생산 입고 1건만 충족 가능)
    session.add(
        Inventory(
            item_id=child.item_id,
            quantity=component_wh_qty,
            warehouse_qty=Decimal("0"),
            pending_quantity=Decimal("0"),
        )
    )
    session.add(
        InventoryLocation(
            item_id=child.item_id,
            department=DepartmentEnum.TUBE,
            status=LocationStatusEnum.PRODUCTION,
            quantity=component_wh_qty,
        )
    )
    # 완제품 P: 0 재고
    session.add(
        Inventory(
            item_id=parent.item_id,
            quantity=Decimal("0"),
            warehouse_qty=Decimal("0"),
            pending_quantity=Decimal("0"),
        )
    )
    session.commit()
    ids = {"parent_id": parent.item_id, "child_id": child.item_id}
    session.close()
    return ids


def _assert_clean_one_winner(statuses, bodies):
    """정확히 1건 2xx + 1건 깨끗한 4xx(422 STOCK_SHORTAGE), 500/unhandled 아님."""
    successes = [s for s in statuses if 200 <= s < 300]
    failures = [s for s in statuses if s >= 400]

    assert len(statuses) == 2, f"두 요청 모두 완료되어야 함: {statuses}"
    assert len(successes) == 1, (
        f"성공은 정확히 1건이어야 함. statuses={statuses} bodies={bodies}"
    )
    assert len(failures) == 1, (
        f"실패는 정확히 1건이어야 함. statuses={statuses} bodies={bodies}"
    )

    loser_status = failures[0]
    assert 400 <= loser_status < 500, (
        f"loser 는 깨끗한 4xx 여야 함 (500/unhandled 아님). "
        f"실제 status={loser_status} body={bodies}"
    )
    assert loser_status == 422, (
        f"loser 는 422 STOCK_SHORTAGE 기대. 실제={loser_status} body={bodies}"
    )
    loser_body = next(b for b, s in zip(bodies, statuses) if s == loser_status)
    detail = loser_body.get("detail", {})
    code = detail.get("code") if isinstance(detail, dict) else None
    assert code == "STOCK_SHORTAGE", (
        f"loser detail.code 는 STOCK_SHORTAGE 기대. 실제 body={loser_body}"
    )


def _assert_invariant_and_no_orphans(make_session, parent_id, child_id):
    """재고 불변식 + loser orphan TransactionLog/부분 배치 0건."""
    from app.services.integrity import check_inventory_consistency

    verify = make_session()
    try:
        mismatches = check_inventory_consistency(verify)
        assert mismatches == [], f"불변식 위반: {mismatches}"

        child_inv = (
            verify.query(Inventory).filter(Inventory.item_id == child_id).first()
        )
        parent_inv = (
            verify.query(Inventory).filter(Inventory.item_id == parent_id).first()
        )
        assert child_inv.warehouse_qty == Decimal("0"), (
            f"부품 창고: 기대 0 (성공 1건이 1개 소모), 실제 {child_inv.warehouse_qty}"
        )
        assert child_inv.warehouse_qty >= Decimal("0"), "부품 창고 음수"
        assert parent_inv.quantity == Decimal("1"), (
            f"완제품 총량: 기대 1 (성공 1건), 실제 {parent_inv.quantity}"
        )

        # 성공 1건 = 부품 BACKFLUSH 1 + 완제품 PRODUCE 1. loser 는 0건.
        backflush_logs = (
            verify.query(TransactionLog)
            .filter(
                TransactionLog.item_id == child_id,
                TransactionLog.transaction_type == TransactionTypeEnum.BACKFLUSH,
            )
            .all()
        )
        produce_logs = (
            verify.query(TransactionLog)
            .filter(
                TransactionLog.item_id == parent_id,
                TransactionLog.transaction_type == TransactionTypeEnum.PRODUCE,
            )
            .all()
        )
        assert len(backflush_logs) == 1, (
            f"부품 BACKFLUSH 로그 1건 기대 (loser orphan 없음). "
            f"실제 {len(backflush_logs)}"
        )
        assert len(produce_logs) == 1, (
            f"완제품 PRODUCE 로그 1건 기대 (loser 부분 배치 없음). "
            f"실제 {len(produce_logs)}"
        )
    finally:
        verify.close()


@pytest.mark.usefixtures("concurrent_engine")
def test_concurrent_production_receipt_same_component_real_race(
    concurrent_engine, make_session
):
    """실제 2스레드 동시 HTTP 생산 입고 — SQLite writer 직렬화 자연 동작 핀."""
    from app.database import get_db
    from app.main import app

    ids = _setup(make_session, component_wh_qty=Decimal("1"))
    parent_id = ids["parent_id"]
    child_id = ids["child_id"]

    SessionLocal = sessionmaker(
        autocommit=False, autoflush=False, bind=concurrent_engine
    )

    def _override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db

    statuses: list[int] = []
    bodies: list[dict] = []

    def fire():
        with TestClient(app) as c:
            res = c.post(
                "/api/production/receipt",
                json={"item_id": str(parent_id), "quantity": "1"},
            )
        statuses.append(res.status_code)
        try:
            bodies.append(res.json())
        except Exception:
            bodies.append({"_raw": res.text})

    try:
        with ThreadPoolExecutor(max_workers=2) as ex:
            futures = [ex.submit(fire) for _ in range(2)]
            for f in as_completed(futures):
                f.result()
    finally:
        app.dependency_overrides.pop(get_db, None)

    _assert_clean_one_winner(statuses, bodies)
    _assert_invariant_and_no_orphans(make_session, parent_id, child_id)


@pytest.mark.usefixtures("concurrent_engine")
def test_concurrent_production_receipt_loser_late_value_error(
    concurrent_engine, make_session
):
    """audit 핵심 시나리오 결정적 재현:

    pre-check 를 통과한 뒤 loser 의 consume_from_item_department 가 원자적 가드에서
    ValueError 를 늦게 던진다(동시 경합 패배). 라우터가 이 늦은 ValueError 를
    깨끗한 422 STOCK_SHORTAGE 로 매핑해야 한다(500 아님).

    consume_from_item_department 를 1회 한정으로 실제 가드 메시지와 동일한 ValueError 를
    던지도록 래핑 — 실제 동시 패배자가 받는 예외와 동일. 동작 변경 없음.
    """
    from app.database import get_db
    from app.main import app
    from app.services import inventory as inventory_svc

    ids = _setup(make_session, component_wh_qty=Decimal("1"))
    parent_id = ids["parent_id"]
    child_id = ids["child_id"]

    SessionLocal = sessionmaker(
        autocommit=False, autoflush=False, bind=concurrent_engine
    )

    def _override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db

    _real_consume = inventory_svc.consume_from_item_department
    fail_once = {"done": False}

    def _consume_loses_once(db, item, qty):
        # 첫 호출(=loser)만 원자적 가드 패배를 시뮬레이트. consume_from_item_department 가
        # rowcount==0 일 때 실제로 던지는 것과 동일한 ValueError.
        if not fail_once["done"]:
            fail_once["done"] = True
            inv_check = (
                db.query(Inventory).filter(Inventory.item_id == item.item_id).first()
            )
            wh = inv_check.warehouse_qty if inv_check else Decimal("0")
            raise ValueError(f"창고 재고 부족 (창고 {wh}, 차감 요청 {qty}).")
        return _real_consume(db, item, qty)

    # consume_from_item_department 호출은 production_receipt 서비스가 inventory_svc 를 통해
    # 수행한다. 모듈 속성을 직접 패치하면 호출 위치(라우터/서비스)와 무관하게 적용된다.
    inventory_svc.consume_from_item_department = _consume_loses_once

    statuses: list[int] = []
    bodies: list[dict] = []

    def fire():
        with TestClient(app) as c:
            res = c.post(
                "/api/production/receipt",
                json={"item_id": str(parent_id), "quantity": "1"},
            )
        statuses.append(res.status_code)
        try:
            bodies.append(res.json())
        except Exception:
            bodies.append({"_raw": res.text})

    try:
        # 순차 2건: 1건은 가드 패배 시뮬레이트(loser), 1건은 정상(winner).
        fire()
        fire()
    finally:
        app.dependency_overrides.pop(get_db, None)
        inventory_svc.consume_from_item_department = _real_consume

    _assert_clean_one_winner(statuses, bodies)
    _assert_invariant_and_no_orphans(make_session, parent_id, child_id)
