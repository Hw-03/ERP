"""Real preview routes must read a committed snapshot without owning SQLite's writer."""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace
from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import event, text, update
from sqlalchemy.orm import Session, sessionmaker

from app import database
from app.models import (
    BOM, DepartmentEnum, Inventory, InventoryOperation, InventoryOperationKindEnum, InventoryOperationRoleEnum, Item,
    ProcessType, SystemSetting, TransactionLog, TransactionTypeEnum,
)
from app.routers import io
from app.routers.inventory import operations
from app.services.bom_stock_policy import BOM_AUTO_TOKEN_SETTING_KEY


@pytest.fixture()
def preview_database(tmp_path, monkeypatch) -> Iterator[SimpleNamespace]:
    """Use real request dependencies against a new file DB, with no dependency override."""
    url = f"sqlite:///{(tmp_path / 'previews.db').as_posix()}"
    writer = database._create_database_engine(url)
    reader = database._create_database_engine(url, sqlite_read_only=True)

    @event.listens_for(writer, "connect")
    def short_writer_wait(connection, _record):
        connection.execute("PRAGMA busy_timeout=50")

    database.Base.metadata.create_all(writer)
    factory = sessionmaker(bind=writer, autoflush=False)
    with factory() as db:
        db.add_all([
            ProcessType(code="TR", prefix="T", suffix="R", stage_order=10),
            ProcessType(code="TF", prefix="T", suffix="F", stage_order=20),
            SystemSetting(setting_key=BOM_AUTO_TOKEN_SETTING_KEY, setting_value="synthetic-secret-" * 4),
        ])
        db.flush()
        item = Item(item_name="Synthetic raw", process_type_code="TR", model_symbol="9", serial_no=1, unit="EA")
        parent = Item(item_name="Synthetic parent", process_type_code="TF", model_symbol="9", serial_no=1, unit="EA")
        db.add_all([item, parent])
        db.flush()
        db.add_all([
            Inventory(item_id=item.item_id, quantity=7, warehouse_qty=7, pending_quantity=0),
            Inventory(item_id=parent.item_id, quantity=0, warehouse_qty=0, pending_quantity=0),
            BOM(parent_item_id=parent.item_id, child_item_id=item.item_id, quantity=2, unit="EA"),
        ])
        operation = InventoryOperation(kind=InventoryOperationKindEnum.BUSINESS, domain="inventory_io", action="receive", display_label="Synthetic receipt", actor_name="Test", effective_at=datetime.utcnow())
        db.add(operation)
        db.flush()
        db.add(TransactionLog(
            item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE,
            quantity_change=7, quantity_before=0, quantity_after=7,
            operation_id=operation.operation_id, operation_role=InventoryOperationRoleEnum.PRIMARY,
            inventory_effect=[{"scope": "warehouse", "delta": 7}],
        ))
        db.flush()
        ids = SimpleNamespace(item=item.item_id, parent=parent.item_id, operation=operation.operation_id)
        db.commit()
    monkeypatch.setattr(database, "_is_file_sqlite", True)
    monkeypatch.setattr(database, "SessionLocal", factory)
    monkeypatch.setattr(database, "ReadSessionLocal", sessionmaker(bind=reader, autoflush=False))
    app = FastAPI()
    app.include_router(io.router, prefix="/api/io")
    app.include_router(operations.router, prefix="/api/inventory")
    try:
        yield SimpleNamespace(writer=writer, reader=reader, factory=factory, app=app, ids=ids)
    finally:
        reader.dispose()
        writer.dispose()


@pytest.mark.parametrize("kind", ["io", "io_bom", "cancel"])
def test_preview_uses_committed_snapshot_during_another_write(preview_database, kind):
    env = preview_database
    statements = []

    @event.listens_for(env.reader, "before_cursor_execute")
    def record_read_sql(_connection, _cursor, statement, _params, _context, _many):
        statements.append(statement)

    with env.writer.connect() as locker:
        transaction = locker.begin()
        result = locker.execute(update(Inventory).where(Inventory.item_id == env.ids.item).values(warehouse_qty=99))
        assert result.rowcount == 1
        try:
            with TestClient(env.app, raise_server_exceptions=False) as client:
                if kind == "cancel":
                    response = client.post(f"/api/inventory/operations/{env.ids.operation}/cancel/preview")
                else:
                    response = client.post("/api/io/preview", json={
                        "work_type": "process" if kind == "io_bom" else "receive",
                        "sub_type": "produce" if kind == "io_bom" else "receive_supplier",
                        "targets": [{"item_id": str(env.ids.parent if kind == "io_bom" else env.ids.item),
                                     "source_kind": "bom_parent" if kind == "io_bom" else "direct_item", "quantity": 1}],
                    })
            assert response.status_code == 200, response.text
            if kind == "cancel":
                assert response.json()["can_cancel"] is True
                assert response.json()["cells"][0]["current_quantity"] == 7
            if kind == "io_bom":
                automatic = [line for line in response.json()["bundles"][0]["lines"] if line["origin"] == "bom_auto"]
                assert automatic and all(line["bom_auto_token"] for line in automatic)
        finally:
            transaction.rollback()
    assert statements, "Preview must use the actual read engine"
    assert not any(sql.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE")) for sql in statements)
    with env.factory() as db:
        assert db.query(Inventory).filter_by(item_id=env.ids.item).one().warehouse_qty == 7
        assert db.query(TransactionLog).count() == 1
        assert db.query(InventoryOperation).count() == 1


def test_preview_query_only_rejects_all_dml(preview_database):
    from sqlalchemy.exc import OperationalError
    from starlette.requests import Request

    request = Request({"type": "http", "method": "POST", "path": "/api/io/preview",
                       "route": SimpleNamespace(path="/api/io/preview"), "headers": []})
    generator = database.get_db(request)
    db = next(generator)
    try:
        for sql in ["INSERT INTO process_types (code, prefix, suffix, stage_order) VALUES ('XX', 'X', 'X', 99)",
                    "UPDATE inventory SET warehouse_qty = 8", "DELETE FROM inventory"]:
            with pytest.raises(OperationalError, match="readonly"):
                db.execute(text(sql))
    finally:
        generator.close()


def test_capacity_simulation_uses_read_snapshot_without_writes(preview_database):
    """The real simulation route can run while the SQLite writer is held elsewhere."""
    from app.routers import production

    env = preview_database
    env.app.include_router(production.router, prefix="/api/production")
    with env.factory() as db:
        db.add_all([
            ProcessType(code="PF", prefix="P", suffix="F", stage_order=80),
            ProcessType(code="PA", prefix="P", suffix="A", stage_order=75),
            ProcessType(code="AF", prefix="A", suffix="F", stage_order=70),
        ])
        db.flush()
        pf = Item(item_name="Synthetic PF", process_type_code="PF", model_symbol="9", serial_no=1, unit="EA")
        pa = Item(item_name="Synthetic PA", process_type_code="PA", model_symbol="9", serial_no=1, unit="EA")
        af = Item(item_name="Synthetic AF", process_type_code="AF", model_symbol="9", serial_no=1, unit="EA")
        db.add_all([pf, pa, af])
        db.flush()
        db.add_all([
            BOM(parent_item_id=pf.item_id, child_item_id=pa.item_id, quantity=1, unit="EA"),
            BOM(parent_item_id=pa.item_id, child_item_id=af.item_id, quantity=1, unit="EA"),
            BOM(parent_item_id=pa.item_id, child_item_id=env.ids.item, quantity=1, unit="EA"),
            Inventory(item_id=af.item_id, quantity=10, warehouse_qty=10, pending_quantity=0),
        ])
        pf_id = str(pf.item_id)
        db.commit()
    statements = []

    @event.listens_for(env.reader, "before_cursor_execute")
    def record(_connection, _cursor, sql, _params, _context, _many):
        statements.append(sql)

    with env.writer.connect() as locker:
        transaction = locker.begin()
        locker.execute(update(Inventory).where(Inventory.item_id == env.ids.item).values(warehouse_qty=99))
        try:
            with TestClient(env.app, raise_server_exceptions=False) as client:
                response = client.post("/api/production/capacity/simulate", json={
                    "pf_item_id": pf_id, "excluded_item_ids": [],
                })
            assert response.status_code == 200, response.text
            assert response.json()["fast_production"] == 7
        finally:
            transaction.rollback()
    assert statements
    assert not any(sql.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE")) for sql in statements)


def test_capacity_simulation_skips_write_guards_for_non_file_databases(preview_database, monkeypatch):
    """Read-only route semantics must not depend on SQLite's connection selection."""
    from starlette.requests import Request
    from app.services import weekly_inventory_snapshot, stocktake_guard

    def reject_write_guard(*args, **kwargs):
        raise AssertionError("Read-only simulation entered a write guard")

    monkeypatch.setattr(database, "_is_file_sqlite", False)
    monkeypatch.setattr(weekly_inventory_snapshot, "ensure_due_snapshot_committed", reject_write_guard)
    monkeypatch.setattr(stocktake_guard, "lock_control", reject_write_guard)
    path = "/api/production/capacity/simulate"
    request = Request({"type": "http", "method": "POST", "path": path,
                       "route": SimpleNamespace(path=path), "headers": []})
    generator = database.get_db(request)
    db = next(generator)
    try:
        assert db.query(Inventory).count() == 2
    finally:
        generator.close()


def test_general_bom_simulation_reads_committed_stock_while_writer_is_held(preview_database):
    """General BOM exclusion requests must use the same read-only preview connection."""
    from app.routers import bom

    env = preview_database
    env.app.include_router(bom.router, prefix="/api/bom")
    statements = []

    @event.listens_for(env.reader, "before_cursor_execute")
    def record(_connection, _cursor, statement, _params, _context, _many):
        statements.append(statement)

    with env.writer.connect() as locker:
        transaction = locker.begin()
        locker.execute(update(Inventory).where(Inventory.item_id == env.ids.item).values(warehouse_qty=99))
        try:
            with TestClient(env.app, raise_server_exceptions=False) as client:
                response = client.post(f"/api/bom/{env.ids.parent}/capacity/simulate", json={"excluded_item_ids": []})
            assert response.status_code == 200, response.text
            assert response.json()["additional_producible_quantity"] == 3
            assert response.json()["additional_producible_limiting_item_id"] == str(env.ids.item)
        finally:
            transaction.rollback()
    assert statements
    assert not any(sql.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE")) for sql in statements)


def test_preview_read_transaction_does_not_block_another_writer(preview_database):
    from starlette.requests import Request

    env = preview_database
    request = Request({"type": "http", "method": "POST", "path": "/api/io/preview",
                       "route": SimpleNamespace(path="/api/io/preview"), "headers": []})
    generator = database.get_db(request)
    db = next(generator)
    try:
        assert db.query(Inventory).filter_by(item_id=env.ids.item).one().warehouse_qty == 7
        with env.writer.begin() as connection:
            connection.execute(update(Inventory).where(Inventory.item_id == env.ids.item).values(warehouse_qty=8))
        db.expire_all()
        assert db.query(Inventory).filter_by(item_id=env.ids.item).one().warehouse_qty == 7
    finally:
        generator.close()
    with env.factory() as fresh:
        assert fresh.query(Inventory).filter_by(item_id=env.ids.item).one().warehouse_qty == 8


def test_pool_cancel_preview_is_read_only_with_its_shared_flush(preview_database):
    from app.services import defect_actions
    from tests.services.test_defect_pool import pool_environment
    from app.models import DefectStockPool

    env = preview_database
    with env.factory() as db:
        item = db.get(Item, env.ids.item)
        actor, pool = pool_environment(db, item, quantity=7)
        pool_id = pool.pool_id
        defect_actions.unquarantine_inventory(
            db, pool_id=pool_id, item_id=item.item_id, qty=2, dept=DepartmentEnum.WAREHOUSE,
            actor=actor, reason_category="test", reason_memo="synthetic restore",
        )
        operation_id = db.query(InventoryOperation).filter_by(action="restore").one().operation_id
        before = (db.query(InventoryOperation).count(), db.query(TransactionLog).count())
        db.rollback()

    statements = []

    @event.listens_for(env.reader, "before_cursor_execute")
    def record(_connection, _cursor, sql, _params, _context, _many):
        statements.append(sql)

    with TestClient(env.app) as client:
        response = client.post(f"/api/inventory/operations/{operation_id}/cancel/preview")
    assert response.status_code == 200, response.text
    assert response.json()["can_cancel"] is True, response.json()
    assert response.json()["pool_effects"]
    assert not any(sql.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE")) for sql in statements)
    with env.factory() as db:
        assert (db.query(InventoryOperation).count(), db.query(TransactionLog).count()) == before
        assert db.get(DefectStockPool, pool_id).quantity == 5
