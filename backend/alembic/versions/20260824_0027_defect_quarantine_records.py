"""Track defect quarantine quantities as independent records."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260824_0027"
down_revision: Union[str, None] = "20260824_0026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {
    "kind": "data-change",
    "allowed_tables": [
        "defect_quarantine_records",
        "defect_quarantine_memo_revisions",
        "transaction_logs",
        "stock_request_lines",
    ],
    "validator_sql": (
        "SELECT "
        "(SELECT COUNT(*) FROM inventory_locations AS location "
        "WHERE location.status = 'DEFECTIVE' AND location.quantity > 0 "
        "AND location.quantity <> COALESCE(("
        "SELECT SUM(record.remaining_quantity) "
        "FROM defect_quarantine_records AS record "
        "WHERE record.item_id = location.item_id "
        "AND record.department = location.department), 0)) + "
        "(SELECT COUNT(*) FROM ("
        "SELECT record.item_id, record.department, "
        "SUM(record.remaining_quantity) AS total_quantity "
        "FROM defect_quarantine_records AS record "
        "GROUP BY record.item_id, record.department) AS totals "
        "WHERE totals.total_quantity > 0 "
        "AND NOT EXISTS ("
        "SELECT 1 FROM inventory_locations AS location "
        "WHERE location.item_id = totals.item_id "
        "AND location.department = totals.department "
        "AND location.status = 'DEFECTIVE' "
        "AND location.quantity = totals.total_quantity))"
    ),
    "validator_expected": 0,
}


def _tables() -> set[str]:
    if context.is_offline_mode():
        return set()
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table_name: str) -> set[str]:
    if context.is_offline_mode():
        return set()
    return {
        column["name"]
        for column in sa.inspect(op.get_bind()).get_columns(table_name)
    }


def _indexes(table_name: str) -> set[str]:
    if context.is_offline_mode():
        return set()
    return {
        index["name"]
        for index in sa.inspect(op.get_bind()).get_indexes(table_name)
    }


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _snapshot_sqlite_dependents(
    bind: sa.Connection,
    parent_table: str,
) -> list[tuple[str, list[str], list[str], list[tuple[object, ...]]]]:
    """Preserve dependent rows while SQLite recreates a referenced table for a FK."""
    if bind.dialect.name != "sqlite":
        return []

    inspector = sa.inspect(bind)
    remaining = set(inspector.get_table_names())
    parents = {parent_table}
    snapshots: list[tuple[str, list[str], list[str], list[tuple[object, ...]]]] = []

    while True:
        children = sorted(
            table_name
            for table_name in remaining
            if any(
                foreign_key["referred_table"] in parents
                for foreign_key in inspector.get_foreign_keys(table_name)
            )
        )
        if not children:
            break
        for table_name in children:
            columns = [column["name"] for column in inspector.get_columns(table_name)]
            primary_key_columns = list(
                inspector.get_pk_constraint(table_name).get("constrained_columns") or []
            )
            if not primary_key_columns:
                raise RuntimeError(
                    f"SQLite {parent_table} dependent table has no primary key: {table_name}"
                )
            selected_columns = ", ".join(_quote_identifier(column) for column in columns)
            rows = [
                tuple(row)
                for row in bind.exec_driver_sql(
                    f"SELECT {selected_columns} FROM {_quote_identifier(table_name)}"
                ).fetchall()
            ]
            snapshots.append((table_name, columns, primary_key_columns, rows))
        remaining.difference_update(children)
        parents.update(children)
    return snapshots


def _restore_sqlite_dependents(
    bind: sa.Connection,
    snapshots: list[tuple[str, list[str], list[str], list[tuple[object, ...]]]],
) -> None:
    """Restore dependent rows removed by SQLite's table recreation cascade."""
    for table_name, columns, primary_key_columns, rows in snapshots:
        if not rows:
            continue
        column_sql = ", ".join(_quote_identifier(column) for column in columns)
        placeholder_sql = ", ".join("?" for _ in columns)
        primary_key_sql = ", ".join(
            _quote_identifier(column) for column in primary_key_columns
        )
        update_columns = [column for column in columns if column not in primary_key_columns]
        if update_columns:
            update_sql = ", ".join(
                f"{_quote_identifier(column)} = excluded.{_quote_identifier(column)}"
                for column in update_columns
            )
            conflict_sql = f"DO UPDATE SET {update_sql}"
        else:
            conflict_sql = "DO NOTHING"
        bind.exec_driver_sql(
            f"INSERT INTO {_quote_identifier(table_name)} ({column_sql}) "
            f"VALUES ({placeholder_sql}) "
            f"ON CONFLICT ({primary_key_sql}) {conflict_sql}",
            rows,
        )


def _create_record_table() -> None:
    op.create_table(
        "defect_quarantine_records",
        sa.Column("record_id", sa.String(length=32), nullable=False),
        sa.Column("item_id", sa.String(length=32), nullable=False),
        sa.Column("department", sa.String(length=50), nullable=False),
        sa.Column("original_quantity", sa.Integer(), nullable=False),
        sa.Column("remaining_quantity", sa.Integer(), nullable=False),
        sa.Column(
            "quarantined_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("quarantined_by_employee_id", sa.String(length=32), nullable=True),
        sa.Column("quarantined_by_name", sa.String(length=100), nullable=True),
        sa.Column("reason_category", sa.String(length=32), nullable=True),
        sa.Column("current_memo", sa.Text(), nullable=True),
        sa.Column("is_legacy", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("legacy_location_id", sa.String(length=32), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "original_quantity > 0", name="ck_defect_record_original_positive"
        ),
        sa.CheckConstraint(
            "remaining_quantity >= 0",
            name="ck_defect_record_remaining_nonnegative",
        ),
        sa.CheckConstraint(
            "remaining_quantity <= original_quantity",
            name="ck_defect_record_remaining_le_original",
        ),
        sa.ForeignKeyConstraint(
            ["item_id"], ["items.item_id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["quarantined_by_employee_id"],
            ["employees.employee_id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["legacy_location_id"],
            ["inventory_locations.location_id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("record_id"),
        sa.UniqueConstraint(
            "legacy_location_id", name="uq_defect_record_legacy_location"
        ),
    )
    op.create_index(
        "ix_defect_quarantine_records_item_id",
        "defect_quarantine_records",
        ["item_id"],
    )
    op.create_index(
        "ix_defect_quarantine_records_department",
        "defect_quarantine_records",
        ["department"],
    )
    op.create_index(
        "ix_defect_quarantine_records_quarantined_at",
        "defect_quarantine_records",
        ["quarantined_at"],
    )
    op.create_index(
        "ix_defect_quarantine_records_quarantined_by_employee_id",
        "defect_quarantine_records",
        ["quarantined_by_employee_id"],
    )
    op.create_index(
        "ix_defect_record_item_dept_active",
        "defect_quarantine_records",
        ["item_id", "department", "remaining_quantity"],
    )


def _create_revision_table() -> None:
    op.create_table(
        "defect_quarantine_memo_revisions",
        sa.Column("revision_id", sa.String(length=32), nullable=False),
        sa.Column("record_id", sa.String(length=32), nullable=False),
        sa.Column("previous_memo", sa.Text(), nullable=True),
        sa.Column("next_memo", sa.Text(), nullable=True),
        sa.Column("edited_by_employee_id", sa.String(length=32), nullable=True),
        sa.Column("edited_by_name", sa.String(length=100), nullable=False),
        sa.Column(
            "edited_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("is_initial", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.ForeignKeyConstraint(
            ["record_id"],
            ["defect_quarantine_records.record_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["edited_by_employee_id"],
            ["employees.employee_id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("revision_id"),
    )
    op.create_index(
        "ix_defect_quarantine_memo_revisions_record_id",
        "defect_quarantine_memo_revisions",
        ["record_id"],
    )


def _add_reference_column(table_name: str) -> None:
    column_name = "defect_quarantine_record_id"
    if column_name not in _columns(table_name):
        bind = op.get_bind() if not context.is_offline_mode() else None
        snapshots = (
            _snapshot_sqlite_dependents(bind, table_name) if bind is not None else []
        )
        with op.batch_alter_table(table_name) as batch_op:
            batch_op.add_column(
                sa.Column(column_name, sa.String(length=32), nullable=True)
            )
            batch_op.create_foreign_key(
                f"fk_{table_name}_defect_quarantine_record",
                "defect_quarantine_records",
                [column_name],
                ["record_id"],
                ondelete="SET NULL",
            )
        if bind is not None:
            _restore_sqlite_dependents(bind, snapshots)
    index_name = f"ix_{table_name}_{column_name}"
    if index_name not in _indexes(table_name):
        op.create_index(index_name, table_name, [column_name])


def _backfill_legacy_records() -> None:
    bind = op.get_bind()
    locations = bind.execute(
        sa.text(
            """
            SELECT location_id, item_id, department, quantity, defective_at
            FROM inventory_locations
            WHERE status = 'DEFECTIVE' AND quantity > 0
            """
        )
    ).mappings()

    for location in locations:
        existing = bind.execute(
            sa.text(
                "SELECT record_id FROM defect_quarantine_records "
                "WHERE legacy_location_id = :location_id"
            ),
            {"location_id": location["location_id"]},
        ).first()
        if existing:
            continue

        log = bind.execute(
            sa.text(
                """
                SELECT producer_employee_id, produced_by, reason_category,
                       reason_memo, created_at
                FROM transaction_logs
                WHERE item_id = :item_id
                  AND department = :department
                  AND transaction_type = 'MARK_DEFECTIVE'
                  AND cancelled = :cancelled
                ORDER BY created_at DESC
                LIMIT 1
                """
            ),
            {
                "item_id": location["item_id"],
                "department": location["department"],
                "cancelled": False,
            },
        ).mappings().first()

        record_id = uuid.uuid4().hex
        revision_id = uuid.uuid4().hex
        actor_name = log["produced_by"] if log and log["produced_by"] else None
        actor_employee_id = log["producer_employee_id"] if log else None
        memo = log["reason_memo"] if log else None
        reason_category = log["reason_category"] if log else None
        quarantined_at = (
            location["defective_at"]
            or (log["created_at"] if log else None)
            or datetime.utcnow()
        )
        edited_by_name = actor_name or "기존 합산 마이그레이션"

        bind.execute(
            sa.text(
                """
                INSERT INTO defect_quarantine_records (
                    record_id, item_id, department, original_quantity,
                    remaining_quantity, quarantined_at,
                    quarantined_by_employee_id, quarantined_by_name,
                    reason_category, current_memo, is_legacy,
                    legacy_location_id, created_at, updated_at
                ) VALUES (
                    :record_id, :item_id, :department, :quantity,
                    :quantity, :quarantined_at,
                    :actor_employee_id, :actor_name,
                    :reason_category, :memo, :is_legacy,
                    :location_id, :quarantined_at, :quarantined_at
                )
                """
            ),
            {
                "record_id": record_id,
                "item_id": location["item_id"],
                "department": location["department"],
                "quantity": location["quantity"],
                "quarantined_at": quarantined_at,
                "actor_employee_id": actor_employee_id,
                "actor_name": actor_name,
                "reason_category": reason_category,
                "memo": memo,
                "is_legacy": True,
                "location_id": location["location_id"],
            },
        )
        bind.execute(
            sa.text(
                """
                INSERT INTO defect_quarantine_memo_revisions (
                    revision_id, record_id, previous_memo, next_memo,
                    edited_by_employee_id, edited_by_name, edited_at, is_initial
                ) VALUES (
                    :revision_id, :record_id, NULL, :memo,
                    :actor_employee_id, :edited_by_name, :edited_at, :is_initial
                )
                """
            ),
            {
                "revision_id": revision_id,
                "record_id": record_id,
                "memo": memo,
                "actor_employee_id": actor_employee_id,
                "edited_by_name": edited_by_name,
                "edited_at": quarantined_at,
                "is_initial": True,
            },
        )


def upgrade() -> None:
    tables = _tables()
    if "defect_quarantine_records" not in tables:
        _create_record_table()
    if "defect_quarantine_memo_revisions" not in tables:
        _create_revision_table()

    _add_reference_column("transaction_logs")
    _add_reference_column("stock_request_lines")

    if context.is_offline_mode():
        return
    _backfill_legacy_records()


def downgrade() -> None:
    raise RuntimeError("불량 격리 건별 원장 이력의 downgrade는 지원하지 않습니다.")
