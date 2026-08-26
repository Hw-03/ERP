"""Add append-only inventory operation and cancellation ledgers."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260825_0028"
down_revision: Union[str, None] = "20260824_0027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}

_OPERATION_TABLE_COLUMNS = {
    "inventory_operations": {
        "operation_id",
        "kind",
        "domain",
        "action",
        "status",
        "display_label",
        "actor_employee_id",
        "actor_name",
        "department",
        "reason",
        "idempotency_key",
        "effective_at",
        "contract_version",
        "reverses_operation_id",
        "created_at",
    },
    "inventory_operation_effects": {
        "effect_id",
        "operation_id",
        "effect_kind",
        "subject_type",
        "subject_id",
        "role",
        "before_state",
        "after_state",
        "reverses_effect_id",
        "created_at",
    },
    "defect_inventory_movements": {
        "movement_id",
        "operation_id",
        "record_id",
        "item_id",
        "department",
        "movement_type",
        "quantity_delta",
        "role",
        "actor_employee_id",
        "actor_name",
        "effective_at",
        "reverses_movement_id",
        "created_at",
    },
}
_TRANSACTION_OPERATION_COLUMNS = {"operation_id", "operation_role", "reverses_log_id"}
_HANDOVER_CANCELLATION_COLUMNS = {
    "cancelled_by_employee_id",
    "cancelled_by_name",
    "cancelled_at",
}
_WEEKLY_V2_SNAPSHOT_COLUMNS = {
    "basis_version",
    "normal_total_quantity",
    "defective_total_quantity",
}
_WEEKLY_V2_ITEM_COLUMNS = {"normal_quantity", "defective_quantity"}


def _column_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def _existing_schema_state(bind: sa.Connection) -> str:
    """미버전 최신 DB 재검증은 허용하고 일부만 존재하는 원장은 거부한다."""
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    operation_tables = set(_OPERATION_TABLE_COLUMNS)
    transaction_columns = _column_names(inspector, "transaction_logs")
    handover_columns = _column_names(inspector, "handovers")
    snapshot_columns = _column_names(inspector, "weekly_inventory_snapshots")
    snapshot_item_columns = _column_names(inspector, "weekly_inventory_snapshot_items")

    markers_present = bool(
        (tables & operation_tables)
        or (transaction_columns & _TRANSACTION_OPERATION_COLUMNS)
        or (handover_columns & _HANDOVER_CANCELLATION_COLUMNS)
        or (snapshot_columns & _WEEKLY_V2_SNAPSHOT_COLUMNS)
        or (snapshot_item_columns & _WEEKLY_V2_ITEM_COLUMNS)
    )
    if not markers_present:
        return "absent"

    if not all(
        table_name in tables
        and _column_names(inspector, table_name) == expected_columns
        for table_name, expected_columns in _OPERATION_TABLE_COLUMNS.items()
    ):
        return "partial"
    if not _TRANSACTION_OPERATION_COLUMNS <= transaction_columns:
        return "partial"
    if not _HANDOVER_CANCELLATION_COLUMNS <= handover_columns:
        return "partial"
    if not _WEEKLY_V2_SNAPSHOT_COLUMNS <= snapshot_columns:
        return "partial"
    if not _WEEKLY_V2_ITEM_COLUMNS <= snapshot_item_columns:
        return "partial"

    required_uniques = {
        "inventory_operations": {
            ("idempotency_key",),
            ("reverses_operation_id",),
        },
        "inventory_operation_effects": {
            ("reverses_effect_id",)
        },
        "defect_inventory_movements": {("reverses_movement_id",)},
        "transaction_logs": {("reverses_log_id",)},
    }
    for table_name, required_columns in required_uniques.items():
        actual_columns = {
            tuple(constraint.get("column_names") or ())
            for constraint in inspector.get_unique_constraints(table_name)
        }
        if not required_columns <= actual_columns:
            return "partial"
    return "complete"


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _snapshot_sqlite_dependents(
    bind: sa.Connection,
) -> list[tuple[str, list[str], list[str], list[tuple[object, ...]]]]:
    """SQLite가 transaction_logs를 재생성할 때 하위 감사 행을 보존한다."""
    if bind.dialect.name != "sqlite":
        return []

    inspector = sa.inspect(bind)
    remaining = set(inspector.get_table_names())
    parents = {"transaction_logs"}
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
            primary_keys = list(
                inspector.get_pk_constraint(table_name).get("constrained_columns") or []
            )
            if not primary_keys:
                raise RuntimeError(
                    f"SQLite transaction_logs dependent table has no primary key: {table_name}"
                )
            selected = ", ".join(_quote_identifier(column) for column in columns)
            rows = [
                tuple(row)
                for row in bind.exec_driver_sql(
                    f"SELECT {selected} FROM {_quote_identifier(table_name)}"
                ).fetchall()
            ]
            snapshots.append((table_name, columns, primary_keys, rows))
        remaining.difference_update(children)
        parents.update(children)
    return snapshots


def _restore_sqlite_dependents(
    bind: sa.Connection,
    snapshots: list[tuple[str, list[str], list[str], list[tuple[object, ...]]]],
) -> None:
    for table_name, columns, primary_keys, rows in snapshots:
        if not rows:
            continue
        column_sql = ", ".join(_quote_identifier(column) for column in columns)
        placeholders = ", ".join("?" for _ in columns)
        primary_key_sql = ", ".join(_quote_identifier(column) for column in primary_keys)
        update_columns = [column for column in columns if column not in primary_keys]
        if update_columns:
            updates = ", ".join(
                f"{_quote_identifier(column)} = excluded.{_quote_identifier(column)}"
                for column in update_columns
            )
            conflict = f"DO UPDATE SET {updates}"
        else:
            conflict = "DO NOTHING"
        bind.exec_driver_sql(
            f"INSERT INTO {_quote_identifier(table_name)} ({column_sql}) "
            f"VALUES ({placeholders}) ON CONFLICT ({primary_key_sql}) {conflict}",
            rows,
        )


def _create_operation_tables() -> None:
    op.create_table(
        "inventory_operations",
        sa.Column("operation_id", sa.String(length=32), nullable=False),
        sa.Column(
            "kind",
            sa.Enum("BUSINESS", "CANCELLATION", name="inventory_operation_kind_enum"),
            nullable=False,
        ),
        sa.Column("domain", sa.String(length=40), nullable=False),
        sa.Column("action", sa.String(length=60), nullable=False),
        sa.Column(
            "status",
            sa.Enum("COMMITTED", name="inventory_operation_status_enum"),
            server_default="COMMITTED",
            nullable=False,
        ),
        sa.Column("display_label", sa.String(length=120), nullable=False),
        sa.Column("actor_employee_id", sa.String(length=32), nullable=True),
        sa.Column("actor_name", sa.String(length=100), nullable=False),
        sa.Column("department", sa.String(length=50), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("idempotency_key", sa.String(length=160), nullable=True),
        sa.Column("effective_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("contract_version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("reverses_operation_id", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["actor_employee_id"], ["employees.employee_id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["reverses_operation_id"],
            ["inventory_operations.operation_id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("operation_id"),
        sa.UniqueConstraint("idempotency_key", name="uq_inventory_operation_idempotency_key"),
        sa.UniqueConstraint(
            "reverses_operation_id", name="uq_inventory_operation_reverses_operation"
        ),
    )
    op.create_index("ix_inventory_operations_kind", "inventory_operations", ["kind"])
    op.create_index("ix_inventory_operations_domain", "inventory_operations", ["domain"])
    op.create_index("ix_inventory_operations_action", "inventory_operations", ["action"])
    op.create_index(
        "ix_inventory_operations_actor_employee_id",
        "inventory_operations",
        ["actor_employee_id"],
    )
    op.create_index(
        "ix_inventory_operations_department", "inventory_operations", ["department"]
    )
    op.create_index(
        "ix_inventory_operations_effective_at", "inventory_operations", ["effective_at"]
    )
    op.create_index(
        "ix_inventory_operations_reverses_operation_id",
        "inventory_operations",
        ["reverses_operation_id"],
    )
    op.create_index(
        "ix_inventory_operation_domain_action",
        "inventory_operations",
        ["domain", "action"],
    )
    op.create_index(
        "ix_inventory_operation_effective_id",
        "inventory_operations",
        ["effective_at", "operation_id"],
    )

    op.create_table(
        "inventory_operation_effects",
        sa.Column("effect_id", sa.String(length=32), nullable=False),
        sa.Column("operation_id", sa.String(length=32), nullable=False),
        sa.Column(
            "effect_kind",
            sa.Enum(
                "INVENTORY",
                "DEFECT_LEDGER",
                "RESERVATION",
                "ALLOCATION",
                "WORKFLOW",
                name="inventory_operation_effect_kind_enum",
            ),
            nullable=False,
        ),
        sa.Column("subject_type", sa.String(length=50), nullable=False),
        sa.Column("subject_id", sa.String(length=80), nullable=False),
        sa.Column("role", sa.String(length=60), nullable=False),
        sa.Column("before_state", sa.JSON(), nullable=False),
        sa.Column("after_state", sa.JSON(), nullable=False),
        sa.Column("reverses_effect_id", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["operation_id"], ["inventory_operations.operation_id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["reverses_effect_id"],
            ["inventory_operation_effects.effect_id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("effect_id"),
        sa.UniqueConstraint(
            "reverses_effect_id", name="uq_inventory_operation_effect_reverses_effect"
        ),
    )
    op.create_index(
        "ix_inventory_operation_effects_operation_id",
        "inventory_operation_effects",
        ["operation_id"],
    )
    op.create_index(
        "ix_inventory_operation_effects_effect_kind",
        "inventory_operation_effects",
        ["effect_kind"],
    )
    op.create_index(
        "ix_inventory_operation_effects_subject_type",
        "inventory_operation_effects",
        ["subject_type"],
    )
    op.create_index(
        "ix_inventory_operation_effects_subject_id",
        "inventory_operation_effects",
        ["subject_id"],
    )
    op.create_index(
        "ix_inventory_operation_effect_subject",
        "inventory_operation_effects",
        ["subject_type", "subject_id"],
    )

    op.create_table(
        "defect_inventory_movements",
        sa.Column("movement_id", sa.String(length=32), nullable=False),
        sa.Column("operation_id", sa.String(length=32), nullable=False),
        sa.Column("record_id", sa.String(length=32), nullable=False),
        sa.Column("item_id", sa.String(length=32), nullable=False),
        sa.Column("department", sa.String(length=50), nullable=False),
        sa.Column("movement_type", sa.String(length=40), nullable=False),
        sa.Column("quantity_delta", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=60), nullable=False),
        sa.Column("actor_employee_id", sa.String(length=32), nullable=True),
        sa.Column("actor_name", sa.String(length=100), nullable=False),
        sa.Column("effective_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("reverses_movement_id", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["operation_id"], ["inventory_operations.operation_id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["record_id"], ["defect_quarantine_records.record_id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["item_id"], ["items.item_id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["actor_employee_id"], ["employees.employee_id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["reverses_movement_id"],
            ["defect_inventory_movements.movement_id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("movement_id"),
        sa.UniqueConstraint(
            "reverses_movement_id", name="uq_defect_movement_reverses_movement"
        ),
    )
    for index_name, columns in (
        ("ix_defect_inventory_movements_operation_id", ["operation_id"]),
        ("ix_defect_inventory_movements_record_id", ["record_id"]),
        ("ix_defect_inventory_movements_item_id", ["item_id"]),
        ("ix_defect_inventory_movements_department", ["department"]),
        ("ix_defect_inventory_movements_movement_type", ["movement_type"]),
        ("ix_defect_inventory_movements_actor_employee_id", ["actor_employee_id"]),
        ("ix_defect_inventory_movements_effective_at", ["effective_at"]),
        ("ix_defect_movement_record_effective", ["record_id", "effective_at"]),
        ("ix_defect_movement_item_department", ["item_id", "department"]),
    ):
        op.create_index(index_name, "defect_inventory_movements", columns)


def _alter_transaction_logs() -> None:
    role_enum = sa.Enum(
        "PRIMARY",
        "COMPONENT_INPUT",
        "PRODUCT_OUTPUT",
        "TRANSFER",
        "CORRECTION",
        "REWORK_PARENT_NORMAL",
        "REWORK_PARENT_DEFECTIVE",
        "REWORK_CHILD_NORMAL",
        "REWORK_CHILD_DEFECTIVE",
        "REWORK_CHILD_SCRAP",
        name="inventory_operation_role_enum",
    )
    if context.is_offline_mode():
        with op.batch_alter_table("transaction_logs") as batch_op:
            batch_op.add_column(sa.Column("operation_id", sa.String(length=32), nullable=True))
            batch_op.add_column(sa.Column("operation_role", role_enum, nullable=True))
            batch_op.add_column(sa.Column("reverses_log_id", sa.String(length=32), nullable=True))
            batch_op.create_foreign_key(
                "fk_transaction_logs_operation_id_inventory_operations",
                "inventory_operations",
                ["operation_id"],
                ["operation_id"],
                ondelete="RESTRICT",
            )
            batch_op.create_foreign_key(
                "fk_transaction_logs_reverses_log_id_transaction_logs",
                "transaction_logs",
                ["reverses_log_id"],
                ["log_id"],
                ondelete="RESTRICT",
            )
            batch_op.create_unique_constraint(
                "uq_transaction_log_reverses_log", ["reverses_log_id"]
            )
    else:
        bind = op.get_bind()
        snapshots = _snapshot_sqlite_dependents(bind)
        with op.batch_alter_table("transaction_logs") as batch_op:
            batch_op.add_column(sa.Column("operation_id", sa.String(length=32), nullable=True))
            batch_op.add_column(sa.Column("operation_role", role_enum, nullable=True))
            batch_op.add_column(sa.Column("reverses_log_id", sa.String(length=32), nullable=True))
            batch_op.create_foreign_key(
                "fk_transaction_logs_operation_id_inventory_operations",
                "inventory_operations",
                ["operation_id"],
                ["operation_id"],
                ondelete="RESTRICT",
            )
            batch_op.create_foreign_key(
                "fk_transaction_logs_reverses_log_id_transaction_logs",
                "transaction_logs",
                ["reverses_log_id"],
                ["log_id"],
                ondelete="RESTRICT",
            )
            batch_op.create_unique_constraint(
                "uq_transaction_log_reverses_log", ["reverses_log_id"]
            )
        _restore_sqlite_dependents(bind, snapshots)

    op.create_index("ix_transaction_logs_operation_id", "transaction_logs", ["operation_id"])
    op.create_index("ix_transaction_logs_operation_role", "transaction_logs", ["operation_role"])
    op.create_index("ix_transaction_logs_reverses_log_id", "transaction_logs", ["reverses_log_id"])
    op.create_index(
        "ix_tx_operation_created", "transaction_logs", ["operation_id", "created_at"]
    )


def _alter_handovers() -> None:
    """인수 완료 역전 후 대기 상태 대신 최종 취소로 닫을 감사 필드를 추가한다."""
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE handover_status_enum ADD VALUE IF NOT EXISTS 'cancelled'")
    with op.batch_alter_table("handovers") as batch_op:
        batch_op.add_column(sa.Column("cancelled_by_employee_id", sa.String(length=32)))
        batch_op.add_column(sa.Column("cancelled_by_name", sa.String(length=100)))
        batch_op.add_column(sa.Column("cancelled_at", sa.DateTime()))
        batch_op.create_foreign_key(
            "fk_handovers_cancelled_by_employee_id_employees",
            "employees",
            ["cancelled_by_employee_id"],
            ["employee_id"],
            ondelete="SET NULL",
        )


def _alter_weekly_snapshots() -> None:
    """신규 주차부터 정상·불량 기준선을 분리 보존한다."""
    with op.batch_alter_table("weekly_inventory_snapshots") as batch_op:
        batch_op.add_column(
            sa.Column("basis_version", sa.Integer(), server_default="1", nullable=False)
        )
        batch_op.add_column(sa.Column("normal_total_quantity", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("defective_total_quantity", sa.Integer(), nullable=True))
        batch_op.create_check_constraint(
            "ck_weekly_inventory_snapshots_normal_total_nonneg",
            "normal_total_quantity IS NULL OR normal_total_quantity >= 0",
        )
        batch_op.create_check_constraint(
            "ck_weekly_inventory_snapshots_defective_total_nonneg",
            "defective_total_quantity IS NULL OR defective_total_quantity >= 0",
        )
    with op.batch_alter_table("weekly_inventory_snapshot_items") as batch_op:
        batch_op.add_column(sa.Column("normal_quantity", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("defective_quantity", sa.Integer(), nullable=True))
        batch_op.create_check_constraint(
            "ck_weekly_inventory_snapshot_items_normal_nonneg",
            "normal_quantity IS NULL OR normal_quantity >= 0",
        )
        batch_op.create_check_constraint(
            "ck_weekly_inventory_snapshot_items_defective_nonneg",
            "defective_quantity IS NULL OR defective_quantity >= 0",
        )


def upgrade() -> None:
    if not context.is_offline_mode():
        state = _existing_schema_state(op.get_bind())
        if state == "complete":
            return
        if state == "partial":
            raise RuntimeError(
                "existing inventory operation ledger does not match the expected schema"
            )
    _create_operation_tables()
    _alter_transaction_logs()
    _alter_handovers()
    _alter_weekly_snapshots()


def downgrade() -> None:
    raise RuntimeError("inventory operation ledger downgrade is disabled")
