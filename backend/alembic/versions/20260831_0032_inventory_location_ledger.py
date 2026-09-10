"""Add the explicit warehouse B/Z/U physical location ledger."""

from __future__ import annotations

from typing import Sequence, Union
import uuid

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260831_0032"
down_revision: Union[str, None] = "20260828_0031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BOX_UNIQUE_INDEX = "uq_warehouse_box_items_box_item"
ZONE_UNIQUE_INDEX = "uq_warehouse_zone_items_zone_item"
UNPLACED_UNIQUE_INDEX = "uq_warehouse_unplaced_items_item_id"
SOURCE_TABLES = (
    "items",
    "inventory",
    "warehouse_angles",
    "warehouse_boxes",
    "warehouse_box_items",
    "warehouse_special_zones",
    "warehouse_special_zone_items",
)

EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "data-preserving"}


def _first(sql: str) -> object | None:
    return op.get_bind().execute(sa.text(sql)).first()


def _lock_postgresql_sources() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute(
        "LOCK TABLE "
        + ", ".join(SOURCE_TABLES)
        + " IN SHARE ROW EXCLUSIVE MODE"
    )


def _lock_postgresql_inventory_operations() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute("LOCK TABLE inventory_operations IN SHARE ROW EXCLUSIVE MODE")


def _has_unique_index(
    inspector: sa.Inspector,
    table_name: str,
    index_name: str,
    columns: list[str],
) -> bool:
    def is_unconditional(index: dict[str, object]) -> bool:
        dialect_options = index.get("dialect_options") or {}
        if not isinstance(dialect_options, dict):
            return False
        return not any(
            str(option).endswith("_where") and predicate is not None
            for option, predicate in dialect_options.items()
        )

    return any(
        index["name"] == index_name
        and bool(index.get("unique"))
        and index.get("column_names") == columns
        and is_unconditional(index)
        for index in inspector.get_indexes(table_name)
    )


def _assert_no_partial_schema() -> bool:
    """Return whether an exact, fully populated target schema already exists."""
    inspector = sa.inspect(op.get_bind())
    has_table = "warehouse_unplaced_items" in inspector.get_table_names()
    has_box_index = _has_unique_index(
        inspector,
        "warehouse_box_items",
        BOX_UNIQUE_INDEX,
        ["box_id", "item_id"],
    )
    has_zone_index = _has_unique_index(
        inspector,
        "warehouse_special_zone_items",
        ZONE_UNIQUE_INDEX,
        ["zone_id", "item_id"],
    )
    if not any((has_table, has_box_index, has_zone_index)):
        return False
    if not all((has_table, has_box_index, has_zone_index)):
        raise RuntimeError(
            "revision 0032 target schema is partial; automatic replacement is not allowed"
        )

    columns = {
        column["name"]: column
        for column in inspector.get_columns("warehouse_unplaced_items")
    }
    primary_key = inspector.get_pk_constraint("warehouse_unplaced_items")
    foreign_keys = inspector.get_foreign_keys("warehouse_unplaced_items")
    checks = {
        check["name"]: "".join(str(check.get("sqltext") or "").lower().split())
        for check in inspector.get_check_constraints("warehouse_unplaced_items")
    }
    expected_columns = {"id", "item_id", "quantity"}
    string_columns_are_exact = all(
        isinstance(columns[name]["type"], sa.String)
        and columns[name]["type"].length == 32
        for name in ("id", "item_id")
        if name in columns
    )
    quantity_is_integer = "quantity" in columns and isinstance(
        columns["quantity"]["type"], sa.Integer
    )
    exact_unplaced_schema = (
        set(columns) == expected_columns
        and all(not bool(columns[name]["nullable"]) for name in expected_columns)
        and string_columns_are_exact
        and quantity_is_integer
        and primary_key.get("constrained_columns") == ["id"]
        and _has_unique_index(
            inspector,
            "warehouse_unplaced_items",
            UNPLACED_UNIQUE_INDEX,
            ["item_id"],
        )
        and checks.get("ck_warehouse_unplaced_items_quantity_nonnegative")
        == "quantity>=0"
        and any(
            foreign_key.get("constrained_columns") == ["item_id"]
            and foreign_key.get("referred_table") == "items"
            and foreign_key.get("referred_columns") == ["item_id"]
            and str(foreign_key.get("options", {}).get("ondelete", "")).upper()
            == "CASCADE"
            for foreign_key in foreign_keys
        )
    )
    if not exact_unplaced_schema:
        raise RuntimeError(
            "revision 0032 target schema is incompatible; automatic replacement is not allowed"
        )
    return True


def _assert_no_duplicates() -> None:
    duplicate_box = _first(
        "SELECT box_id, item_id FROM warehouse_box_items "
        "GROUP BY box_id, item_id HAVING COUNT(*) > 1 LIMIT 1"
    )
    if duplicate_box is not None:
        raise RuntimeError(
            "warehouse_box_items contains duplicate box/item rows; "
            "automatic merge is not allowed"
        )
    duplicate_zone = _first(
        "SELECT zone_id, item_id FROM warehouse_special_zone_items "
        "GROUP BY zone_id, item_id HAVING COUNT(*) > 1 LIMIT 1"
    )
    if duplicate_zone is not None:
        raise RuntimeError(
            "warehouse_special_zone_items contains duplicate zone/item rows; "
            "automatic merge is not allowed"
        )


def _assert_no_orphans() -> None:
    orphan = _first(
        "SELECT 'inventory_item' AS reason FROM inventory AS i "
        "LEFT JOIN items AS item ON item.item_id = i.item_id "
        "WHERE item.item_id IS NULL "
        "UNION ALL "
        "SELECT 'missing_inventory' FROM items AS item "
        "LEFT JOIN inventory AS i ON i.item_id = item.item_id "
        "WHERE item.deleted_at IS NULL AND i.item_id IS NULL "
        "UNION ALL "
        "SELECT 'box_angle' FROM warehouse_boxes AS box "
        "LEFT JOIN warehouse_angles AS angle ON angle.id = box.angle_id "
        "WHERE angle.id IS NULL "
        "UNION ALL "
        "SELECT 'box_item' FROM warehouse_box_items AS row "
        "LEFT JOIN warehouse_boxes AS box ON box.box_id = row.box_id "
        "LEFT JOIN items AS item ON item.item_id = row.item_id "
        "LEFT JOIN inventory AS i ON i.item_id = row.item_id "
        "WHERE box.box_id IS NULL OR item.item_id IS NULL OR i.item_id IS NULL "
        "UNION ALL "
        "SELECT 'zone_item' FROM warehouse_special_zone_items AS row "
        "LEFT JOIN warehouse_special_zones AS zone ON zone.id = row.zone_id "
        "LEFT JOIN items AS item ON item.item_id = row.item_id "
        "LEFT JOIN inventory AS i ON i.item_id = row.item_id "
        "WHERE zone.id IS NULL OR item.item_id IS NULL OR i.item_id IS NULL "
        "LIMIT 1"
    )
    if orphan is not None:
        raise RuntimeError(
            f"warehouse physical ledger contains an orphan row ({orphan[0]}); "
            "automatic repair is not allowed"
        )


def _assert_nonnegative_sources() -> None:
    negative = _first(
        "SELECT 'inventory' AS scope FROM inventory WHERE warehouse_qty < 0 "
        "UNION ALL "
        "SELECT 'box' FROM warehouse_box_items WHERE quantity < 0 "
        "UNION ALL "
        "SELECT 'zone' FROM warehouse_special_zone_items WHERE quantity < 0 "
        "LIMIT 1"
    )
    if negative is not None:
        raise RuntimeError(
            "warehouse physical ledger contains a negative quantity; "
            "automatic repair is not allowed"
        )


def _assert_no_inactive_zone_stock() -> None:
    inactive = _first(
        "SELECT row.id FROM warehouse_special_zone_items AS row "
        "JOIN warehouse_special_zones AS zone ON zone.id = row.zone_id "
        "WHERE zone.is_active = false AND row.quantity <> 0 LIMIT 1"
    )
    if inactive is not None:
        raise RuntimeError(
            "inactive warehouse zone contains stock; automatic relocation is not allowed"
        )


def _physical_rows() -> list[sa.Row]:
    return list(
        op.get_bind().execute(
            sa.text(
                "SELECT item.item_id, "
                "i.warehouse_qty - COALESCE(boxes.quantity, 0) "
                "- COALESCE(zones.quantity, 0) AS unplaced_quantity "
                "FROM items AS item "
                "JOIN inventory AS i ON i.item_id = item.item_id "
                "LEFT JOIN ("
                "  SELECT item_id, SUM(quantity) AS quantity "
                "  FROM warehouse_box_items GROUP BY item_id"
                ") AS boxes ON boxes.item_id = item.item_id "
                "LEFT JOIN ("
                "  SELECT row.item_id, SUM(row.quantity) AS quantity "
                "  FROM warehouse_special_zone_items AS row "
                "  JOIN warehouse_special_zones AS zone ON zone.id = row.zone_id "
                "  WHERE zone.is_active = true GROUP BY row.item_id"
                ") AS zones ON zones.item_id = item.item_id "
                "ORDER BY item.item_id"
            )
        )
    )


def _assert_not_overplaced(rows: list[sa.Row]) -> None:
    overplaced = next((row for row in rows if int(row.unplaced_quantity) < 0), None)
    if overplaced is not None:
        raise RuntimeError(
            "warehouse physical ledger is overplaced (B+Z>W); "
            "automatic quantity repair is not allowed"
        )


def _create_schema() -> None:
    op.create_index(
        BOX_UNIQUE_INDEX,
        "warehouse_box_items",
        ["box_id", "item_id"],
        unique=True,
    )
    op.create_index(
        ZONE_UNIQUE_INDEX,
        "warehouse_special_zone_items",
        ["zone_id", "item_id"],
        unique=True,
    )
    op.create_table(
        "warehouse_unplaced_items",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("item_id", sa.String(length=32), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "quantity >= 0",
            name="ck_warehouse_unplaced_items_quantity_nonnegative",
        ),
        sa.ForeignKeyConstraint(
            ["item_id"],
            ["items.item_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        UNPLACED_UNIQUE_INDEX,
        "warehouse_unplaced_items",
        ["item_id"],
        unique=True,
    )


def _backfill_unplaced(rows: list[sa.Row]) -> None:
    if not rows:
        return
    table = sa.table(
        "warehouse_unplaced_items",
        sa.column("id", sa.String(length=32)),
        sa.column("item_id", sa.String(length=32)),
        sa.column("quantity", sa.Integer()),
    )
    op.bulk_insert(
        table,
        [
            {
                "id": uuid.uuid4().hex,
                "item_id": str(row.item_id),
                "quantity": int(row.unplaced_quantity),
            }
            for row in rows
        ],
    )


def _assert_final_invariant() -> None:
    mismatch = _first(
        "SELECT item.item_id FROM items AS item "
        "JOIN inventory AS i ON i.item_id = item.item_id "
        "JOIN warehouse_unplaced_items AS u ON u.item_id = item.item_id "
        "LEFT JOIN ("
        "  SELECT item_id, SUM(quantity) AS quantity "
        "  FROM warehouse_box_items GROUP BY item_id"
        ") AS boxes ON boxes.item_id = item.item_id "
        "LEFT JOIN ("
        "  SELECT row.item_id, SUM(row.quantity) AS quantity "
        "  FROM warehouse_special_zone_items AS row "
        "  JOIN warehouse_special_zones AS zone ON zone.id = row.zone_id "
        "  WHERE zone.is_active = true GROUP BY row.item_id"
        ") AS zones ON zones.item_id = item.item_id "
        "WHERE COALESCE(boxes.quantity, 0) + COALESCE(zones.quantity, 0) "
        "+ u.quantity <> i.warehouse_qty LIMIT 1"
    )
    if mismatch is not None:
        raise RuntimeError("warehouse physical ledger invariant verification failed")
    missing = _first(
        "SELECT i.item_id FROM inventory AS i "
        "LEFT JOIN warehouse_unplaced_items AS u ON u.item_id = i.item_id "
        "WHERE u.item_id IS NULL LIMIT 1"
    )
    if missing is not None:
        raise RuntimeError("warehouse unplaced ledger backfill is incomplete")


def _create_and_backfill_atomically(rows: list[sa.Row]) -> None:
    """Keep SQLite's non-transactional Alembic DDL retryable on a late failure."""
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        _create_schema()
        _backfill_unplaced(rows)
        _assert_final_invariant()
        return

    savepoint = "inventory_location_ledger_0032"
    bind.exec_driver_sql(f"SAVEPOINT {savepoint}")
    try:
        _create_schema()
        _backfill_unplaced(rows)
        _assert_final_invariant()
    except Exception:
        bind.exec_driver_sql(f"ROLLBACK TO SAVEPOINT {savepoint}")
        bind.exec_driver_sql(f"RELEASE SAVEPOINT {savepoint}")
        raise
    bind.exec_driver_sql(f"RELEASE SAVEPOINT {savepoint}")


def _drop_schema() -> None:
    op.drop_index(
        UNPLACED_UNIQUE_INDEX,
        table_name="warehouse_unplaced_items",
    )
    op.drop_table("warehouse_unplaced_items")
    op.drop_index(
        ZONE_UNIQUE_INDEX,
        table_name="warehouse_special_zone_items",
    )
    op.drop_index(
        BOX_UNIQUE_INDEX,
        table_name="warehouse_box_items",
    )


def _drop_schema_atomically() -> None:
    """Keep SQLite downgrade DDL retryable if a later drop fails."""
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        _drop_schema()
        return

    savepoint = "inventory_location_ledger_0032_downgrade"
    bind.exec_driver_sql(f"SAVEPOINT {savepoint}")
    try:
        _drop_schema()
    except Exception:
        bind.exec_driver_sql(f"ROLLBACK TO SAVEPOINT {savepoint}")
        bind.exec_driver_sql(f"RELEASE SAVEPOINT {savepoint}")
        raise
    bind.exec_driver_sql(f"RELEASE SAVEPOINT {savepoint}")


def upgrade() -> None:
    if context.is_offline_mode():
        raise RuntimeError(
            "revision 0032 requires online fail-closed inventory validation"
        )
    _lock_postgresql_sources()
    schema_preexists = _assert_no_partial_schema()
    _assert_no_duplicates()
    _assert_no_orphans()
    _assert_nonnegative_sources()
    _assert_no_inactive_zone_stock()
    rows = _physical_rows()
    _assert_not_overplaced(rows)
    if not schema_preexists:
        _create_and_backfill_atomically(rows)
    else:
        _assert_final_invariant()


def downgrade() -> None:
    if context.is_offline_mode():
        raise RuntimeError("revision 0032 downgrade requires online validation")
    _lock_postgresql_inventory_operations()
    contract_v2 = _first(
        "SELECT operation_id FROM inventory_operations "
        "WHERE contract_version >= 2 LIMIT 1"
    )
    if contract_v2 is not None:
        raise RuntimeError(
            "contract v2 inventory effects exist; physical ledger downgrade is unsafe"
        )
    _drop_schema_atomically()
