"""공용 pytest fixtures.

in-memory SQLite + 단일 connection 기반. PRAGMA 셋업과 Base.metadata.create_all
이후 세션을 yield 한다. 각 테스트는 독립된 DB 를 받는다 (모듈 스코프 X).
"""

from __future__ import annotations

import os
import sys
from decimal import Decimal
from pathlib import Path

# 5.4-C: pytest 가 실제 backend/erp.db 를 건드리지 않도록 보장.
# database.py 가 모듈 로드 시 engine = create_engine(DATABASE_URL) 을 평가하므로
# app.* import 전에 DATABASE_URL 을 in-memory 로 고정한다.
# 어떤 fixture 가 app.main 을 import 해도 default engine 이 in-memory 라 실 DB 안 건드림.
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

# tests/ 가 backend/ 하위지만, app 패키지 import 를 위해 backend 를 path 에 추가
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import Base  # noqa: E402  (path 보강 후 import)
from app import models  # noqa: F401, E402  (Base.metadata 등록을 위해 import)


@pytest.fixture()
def db_session() -> Session:
    """함수당 신규 in-memory SQLite + 모든 테이블 생성 + 세션 yield."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _pragmas(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture()
def client(db_session):
    """FastAPI TestClient. get_db 의존성을 db_session 으로 override."""
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
def make_item(db_session):
    """간단한 Item 생성 헬퍼. inventory 까지 함께 만들어준다."""
    from app.models import Item, Inventory, CategoryEnum

    def _make(*, name: str = "테스트품목", category: CategoryEnum = CategoryEnum.RM,
              warehouse_qty: Decimal = Decimal("0"),
              pending: Decimal = Decimal("0")) -> Item:
        item = Item(item_name=name, category=category, unit="EA")
        db_session.add(item)
        db_session.flush()
        inv = Inventory(
            item_id=item.item_id,
            quantity=warehouse_qty,  # 위치 합 0 이라 == warehouse_qty
            warehouse_qty=warehouse_qty,
            pending_quantity=pending,
        )
        db_session.add(inv)
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
