"""A legacy solo moving into an operation must survive a metadata read snapshot."""

from __future__ import annotations

import os
from collections.abc import Generator
from datetime import datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from app.database import Base, get_db
from app.models import (
    Inventory,
    InventoryOperationRoleEnum,
    Item,
    ProcessType,
    SystemSetting,
    TransactionLog,
    TransactionTypeEnum,
)
from app.routers.inventory import transactions
from app.services import inventory_operations


@pytest.fixture()
def postgres_snapshot_engine() -> Generator[Engine, None, None]:
    """Use a disposable private schema and independent READ COMMITTED connections."""
    database_url = os.environ.get("TEST_POSTGRES_URL", "").strip()
    if not database_url:
        pytest.skip("TEST_POSTGRES_URL is required for PostgreSQL snapshot regression")
    base_url = make_url(database_url)
    database_name = base_url.database or ""
    assert database_name.startswith("test_") or database_name.endswith("_test")
    schema_name = f"test_display_snapshot_{uuid4().hex}"
    admin_engine = create_engine(base_url, poolclass=NullPool)
    schema_url = base_url.update_query_dict({"options": f"-csearch_path={schema_name}"}, append=False)
    engine = create_engine(schema_url, poolclass=NullPool, isolation_level="READ COMMITTED")
    try:
        with admin_engine.begin() as connection:
            connection.exec_driver_sql(f'CREATE SCHEMA "{schema_name}"')
            connection.exec_driver_sql(f'SET LOCAL search_path TO "{schema_name}"')
            Base.metadata.create_all(connection)
        yield engine
    finally:
        engine.dispose()
        with admin_engine.begin() as connection:
            connection.exec_driver_sql(f'DROP SCHEMA IF EXISTS "{schema_name}" CASCADE')
        admin_engine.dispose()


def test_legacy_operation_attach_during_metadata_read_keeps_every_original(postgres_snapshot_engine: Engine) -> None:
    """Commit the real adoption/attach mutation immediately after the first metadata SELECT."""
    base = datetime(2026, 9, 2, 3, 0, 0)
    log_ids = [UUID(int=(0xABCD << 32) + index + 1) for index in range(52)]
    target_id = log_ids[-10]
    with Session(postgres_snapshot_engine) as seed:
        seed.add(ProcessType(code="TR", prefix="T", suffix="R", stage_order=0))
        item = Item(item_name="snapshot regression", unit="EA", model_symbol="9", process_type_code="TR", serial_no=1)
        seed.add(item)
        seed.flush()
        seed.add(Inventory(item_id=item.item_id, quantity=52, warehouse_qty=52, pending_quantity=0))
        seed.add(SystemSetting(setting_key=inventory_operations.CUTOVER_SETTING_KEY, setting_value=(base + timedelta(days=1)).isoformat()))
        seed.add_all([
            TransactionLog(
                log_id=log_id, item_id=item.item_id,
                transaction_type=TransactionTypeEnum.RECEIVE, quantity_change=1,
                quantity_before=index, quantity_after=index + 1,
                created_at=base + timedelta(seconds=index),
            )
            for index, log_id in enumerate(log_ids)
        ])
        seed.commit()

    attached = []
    metadata_statements = []
    with Session(postgres_snapshot_engine) as reader:
        connection = reader.connection()
        assert reader.scalar(text("SHOW transaction_isolation")) == "read committed"
        reader_pid = reader.scalar(text("SELECT pg_backend_pid()"))

        def attach_after_metadata(_connection, _cursor, statement, _parameters, _context, _executemany):
            if " AS request_order_at" not in statement or "reason_category" not in statement:
                return
            metadata_statements.append(statement)
            if attached:
                return
            with Session(postgres_snapshot_engine) as writer:
                assert writer.scalar(text("SELECT pg_backend_pid()")) != reader_pid
                assert writer.scalar(text("SHOW transaction_isolation")) == "read committed"
                legacy = writer.get(TransactionLog, target_id)
                assert legacy.operation_id is None
                operation = inventory_operations.adopt_legacy_business_operation(
                    writer, domain="inventory", action="receive", display_label="receive",
                    actor_name="snapshot regression", actor_employee_id=None,
                    department=None, reason=None, idempotency_key=f"snapshot:{target_id}",
                    effective_at=legacy.created_at, adopted_at=base + timedelta(days=2),
                )
                inventory_operations.attach_transaction(legacy, operation, InventoryOperationRoleEnum.PRIMARY)
                operation_id = operation.operation_id
                writer.commit()
                attached.append(operation_id)

        app = FastAPI()
        app.include_router(transactions.router, prefix="/api/inventory")

        def override_db() -> Generator[Session, None, None]:
            yield reader

        app.dependency_overrides[get_db] = override_db
        event.listen(connection, "after_cursor_execute", attach_after_metadata)
        try:
            with TestClient(app) as client:
                first = client.get("/api/inventory/transactions/display-groups", params={"limit": 50})
                assert first.status_code == 200, first.text
                body = first.json()
                first_ids = [row["log_id"] for group in body["groups"] for row in group["logs"]]
                assert attached, "The other connection must commit before metadata rows are consumed"
                assert str(target_id) in first_ids
                assert first_ids == [str(log_id) for log_id in reversed(log_ids[2:])]
                assert len(metadata_statements) == 1
                assert body["has_more"] is True
                second = client.get("/api/inventory/transactions/display-groups", params={"limit": 50, "cursor": body["next_cursor"]})
                assert second.status_code == 200, second.text
                second_body = second.json()
                second_ids = [row["log_id"] for group in second_body["groups"] for row in group["logs"]]
                assert second_body["has_more"] is False
                assert second_body["next_cursor"] is None
                assert first_ids + second_ids == [str(log_id) for log_id in reversed(log_ids)]
                assert len(set(first_ids + second_ids)) == 52
        finally:
            event.remove(connection, "after_cursor_execute", attach_after_metadata)

    with Session(postgres_snapshot_engine) as observer:
        assert observer.get(TransactionLog, target_id).operation_id == attached[0]
