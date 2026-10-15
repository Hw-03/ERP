"""Exercise the closure migrations against a real, disposable PostgreSQL schema."""
from __future__ import annotations

import os
from pathlib import Path

from alembic import command
from alembic.config import Config
import pytest
import sqlalchemy as sa

BACKEND = Path(__file__).resolve().parents[2]
REVISIONS = (*tuple(f"20261007_{number:04}" for number in range(39, 44)), "20261008_0044")


def _snapshot(connection: sa.Connection) -> dict[str, tuple[list[str], list[tuple]]]:
    """Compare every old value, excluding only the approved employee grade."""
    inspector = sa.inspect(connection)
    result = {}
    for name in inspector.get_table_names():
        if name in {"alembic_version", "alembic_schema_state"}:
            continue
        table = sa.Table(name, sa.MetaData(), autoload_with=connection)
        columns = [column.name for column in table.columns
                   if (name, column.name) != ("employees", "level")]
        rows = list(connection.execute(sa.select(*(table.c[name] for name in columns))))
        result[name] = (columns, sorted(map(tuple, rows), key=repr))
    return result


@pytest.mark.skipif(not os.getenv("TEST_POSTGRES_URL"), reason="Requires an isolated TEST_POSTGRES_URL")
def test_postgresql_0038_to_0044_preserves_all_old_values_links_and_nullable_additions(
    postgres_migration_schema_connection: tuple[sa.Connection, str],
) -> None:
    """Commit 0038 enum preparation, then roll back closure changes in a private schema."""
    connection, schema = postgres_migration_schema_connection
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND / "alembic"))
    config.set_main_option("sqlalchemy.url", os.environ["TEST_POSTGRES_URL"])
    config.attributes["connection"] = connection
    command.upgrade(config, "20260928_0038")
    with connection.begin():
        statements = (
            "INSERT INTO suppliers (supplier_id, name, normalized_name, is_active) VALUES ('supplier', 'Preserved supplier', 'preserved supplier', true)",
            "INSERT INTO departments (name, display_order, is_active, io_enabled) VALUES ('assembly', 17, true, true)",
            "INSERT INTO employees (employee_id, employee_code, name, role, department, level, display_order, is_active, pin_hash, warehouse_role, department_role, as_research_approver, theme) VALUES ('actor', 'KEEP-1', 'Preserved actor', 'worker', 'assembly', 'MANAGER', 9, 'true', 'unchanged-pin', 'primary', 'deputy', true, 'dark')",
            "INSERT INTO product_symbols (slot, symbol, model_name, is_reserved, is_finished_good) VALUES (1, '3', 'Model', false, true)",
            "INSERT INTO employee_assigned_models (employee_id, slot, priority) VALUES ('actor', 1, 0)",
            "INSERT INTO process_types (code, prefix, suffix, stage_order) VALUES ('PF', 'P', 'F', 80)",
            "INSERT INTO items (item_id, item_name, unit, model_symbol, process_type_code, serial_no) VALUES ('item', 'Preserved PF', 'EA', '3', 'PF', 1)",
            "INSERT INTO inventory (inventory_id, item_id, quantity, warehouse_qty, pending_quantity, last_reserver_employee_id) VALUES ('inventory', 'item', 9, 9, 3, 'actor')",
            "INSERT INTO stock_requests (request_id, requester_employee_id, requester_name, requester_department, request_type, status, requires_warehouse_approval) VALUES ('request', 'actor', 'Preserved actor', 'assembly', 'WAREHOUSE_TO_DEPT', 'RESERVED', true)",
            "INSERT INTO stock_request_lines (line_id, request_id, item_id, item_name_snapshot, quantity, from_bucket, to_bucket, status) VALUES ('line', 'request', 'item', 'Preserved PF', 3, 'WAREHOUSE', 'PRODUCTION', 'RESERVED')",
            "INSERT INTO shipping_requests (request_id, base_pf_item_id, final_pf_item_id, requested_by_name, invoice_number) VALUES ('shipping', 'item', 'item', 'Preserved actor', 'Original invoice')",
            "INSERT INTO shipping_request_events (event_id, request_id, event_type, message) VALUES ('event', 'shipping', 'REQUEST_CREATED', 'Original event')",
            "INSERT INTO transaction_logs (log_id, item_id, transaction_type, quantity_change, shipping_request_id, supplier_id, supplier_name_snapshot) VALUES ('log', 'item', 'RECEIVE', 1, 'shipping', 'supplier', 'Preserved supplier')",
        )
        for statement in statements:
            connection.execute(sa.text(statement))
        before = _snapshot(connection)
        oids = dict(connection.execute(sa.text(
            "SELECT relname, oid FROM pg_class WHERE relnamespace = CAST(:schema AS regnamespace) AND relkind = 'r'"
        ), {"schema": schema}).all())
        for revision in REVISIONS:
            command.upgrade(config, revision)
            after = _snapshot(connection)
            for name, (columns, rows) in before.items():
                table = sa.Table(name, sa.MetaData(), autoload_with=connection)
                actual = connection.execute(sa.select(*(table.c[column] for column in columns)))
                assert sorted(map(tuple, actual), key=repr) == rows, (revision, name)
                assert set(columns) <= set(after[name][0]), (revision, name)
            assert connection.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one() == revision
        assert "level" not in {column["name"] for column in sa.inspect(connection).get_columns("employees")}
        assert connection.execute(sa.text("SELECT supplier_id, scope FROM suppliers")).all() == [("supplier", "warehouse")]
        for table, column in (("shipping_requests", "submission_payload_hash"),
                              ("departments", "display_name"), ("transaction_logs", "item_snapshot")):
            assert connection.execute(sa.text(f'SELECT count(*) FROM "{table}" WHERE "{column}" IS NOT NULL')).scalar_one() == 0
            actual = next(entry for entry in sa.inspect(connection).get_columns(table) if entry["name"] == column)
            assert actual["nullable"] and actual["default"] is None
        current_oids = dict(connection.execute(sa.text(
            "SELECT relname, oid FROM pg_class WHERE relnamespace = CAST(:schema AS regnamespace) AND relkind = 'r'"
        ), {"schema": schema}).all())
        assert all(current_oids[name] == oid for name, oid in oids.items())
        # Deferred foreign keys must be checked before the rollback boundary.
        connection.execute(sa.text("SET CONSTRAINTS ALL IMMEDIATE"))
        connection.rollback()
