"""PG UUIDString의 VARCHAR(32)는 36자 하이픈 원문을 저장하지 못하므로 대문자 경계를 검증한다."""

from __future__ import annotations

from collections.abc import Generator
import os
from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from app.database import Base
from app.models import Inventory, Item, ProcessType
from app.services.request_order_stock import load_request_order_stock
from tests.services.test_request_order_stock_performance import _entries, _persist


@pytest.fixture()
def postgres_stock_session() -> Generator[Session, None, None]:
    """명시적으로 허용한 테스트 DB의 고유 스키마만 만들고 사용 후 제거한다."""
    database_url = os.environ.get("TEST_POSTGRES_URL", "").strip()
    if not database_url:
        pytest.skip("TEST_POSTGRES_URL is required for PostgreSQL stock history regression")
    url = make_url(database_url)
    assert url.get_backend_name() == "postgresql"
    assert url.host in {"localhost", "127.0.0.1"}
    assert (url.database or "").startswith("test_") or (url.database or "").endswith("_test")
    assert os.environ.get("DEXCOWIN_POSTGRES_TEST_ACK") == "ALLOW_TEST_DB_MUTATION"
    schema = "test_uuid_boundary_" + uuid4().hex
    admin = create_engine(url, poolclass=NullPool)
    engine = create_engine(url.update_query_dict({"options": f"-csearch_path={schema}"}, append=False),
                           poolclass=NullPool)
    schema_oid: int | None = None
    try:
        with admin.begin() as connection:
            assert connection.scalar(text("SELECT current_database()")) == url.database
            connection.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
            schema_oid = connection.scalar(text("SELECT oid FROM pg_namespace WHERE nspname = :schema"),
                                           {"schema": schema})
            assert schema_oid is not None
        with admin.begin() as connection:
            connection.exec_driver_sql(f'SET LOCAL search_path TO "{schema}"')
            Base.metadata.create_all(connection)
        with Session(engine) as db:
            yield db
    finally:
        engine.dispose()
        try:
            if schema_oid is not None:
                with admin.begin() as connection:
                    actual_oid = connection.scalar(text("SELECT oid FROM pg_namespace WHERE nspname = :schema"),
                                                   {"schema": schema})
                    assert actual_oid == schema_oid, "Private schema identity changed; refusing cleanup"
                    connection.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')
                    assert connection.scalar(text("SELECT oid FROM pg_namespace WHERE nspname = :schema"),
                                             {"schema": schema}) is None
        finally:
            admin.dispose()


@pytest.mark.parametrize("scope", ["canonical", "single", "mixed", "alias"])
def test_postgres_uuid_storage_keeps_full_history(postgres_stock_session: Session, scope: str) -> None:
    """UUID 원문이 정규화되는 경우만 전체 조회하며 정상 PK의 기존 왕복·구간 제한을 보존한다."""
    db = postgres_stock_session
    db.add(ProcessType(code="TR", prefix="T", suffix="R", stage_order=0))

    def make_item(*, warehouse_qty: int) -> Item:
        """전체 조회와 대상 조회가 같은 실제 재고를 기준으로 계산하도록 준비한다."""
        item = Item(item_name="PG UUID history", unit="EA", model_symbol="9", process_type_code="TR", serial_no=1)
        db.add(item)
        db.flush()
        db.add(Inventory(item_id=item.item_id, warehouse_qty=warehouse_qty, quantity=warehouse_qty, pending_quantity=0))
        db.flush()
        return item

    entries = _entries(3)
    item, expression = _persist(db, make_item, entries, 3)
    target = entries[1].log_id if scope == "mixed" else entries[-1].log_id
    if scope != "canonical":
        changed = entries[0].log_id if scope == "alias" else target
        db.connection().exec_driver_sql("UPDATE transaction_logs SET log_id=%s WHERE log_id=%s",
                                       (target.hex.upper(), changed.hex))
    targets = {target, entries[-1].log_id} if scope == "mixed" else {target}
    full = load_request_order_stock(db, {item.item_id}, request_date_expr=expression)
    assert full[target].status == "available"
    before = 0 if scope == "alias" else 1 if scope == "mixed" else 2
    assert (full[target].warehouse_qty_before, full[target].warehouse_qty_after) == (before, before + 1)
    statements: list[tuple[str, Any]] = []

    def observe(_connection: Any, _cursor: Any, statement: str, parameters: Any,
                _context: Any, _many: bool) -> None:
        """추가 왕복 없이 MIN과 식별자 검사가 함께 실행되는지 기록한다."""
        statements.append((statement, parameters))

    connection = db.connection()
    event.listen(connection, "before_cursor_execute", observe)
    try:
        actual = load_request_order_stock(db, {item.item_id}, request_date_expr=expression,
                                         target_log_ids=targets)
    finally:
        event.remove(connection, "before_cursor_execute", observe)
    assert actual == {key: value for key, value in full.items() if key in targets}
    assert len(statements) == (4 if scope == "canonical" else 3)
    assert "min(transaction_logs.created_at)" in statements[0][0]
    assert "EXISTS" in statements[0][0] and "!~" in statements[0][0]
    history = [pair for pair in statements if "transaction_logs.inventory_effect" in pair[0]]
    assert len(history) == 1
    assert len(connection.exec_driver_sql(*history[0]).all()) == (1 if scope == "canonical" else 3)
