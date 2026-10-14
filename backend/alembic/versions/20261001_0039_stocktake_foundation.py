"""Add stocktake foundation tables without activating the shared-stock mode."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20261001_0039"
down_revision = "20260928_0038"
branch_labels = None
depends_on = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}

_EXPECTED_COLUMNS = {
    "inventory_scopes": {"scope_key", "department_id", "physical_department", "created_at"},
    "stocktake_control": {"id", "inventory_mode", "active_round_id", "epoch"},
    "operator_sessions": {"session_id", "token_hash", "employee_id", "tab_id", "pin_version", "created_at", "expires_at", "revoked_at"},
    "defect_pool_cutovers": {"cutover_id", "actor_employee_id", "operation_id", "source_fingerprint", "cutover_version", "performed_at"},
    "defect_stock_pools": {"pool_id", "item_id", "scope_key", "category", "quantity", "pending_quantity", "version", "cutover_id"},
    "defect_stock_movements": {"movement_id", "pool_id", "operation_id", "effect_ordinal", "delta", "before_quantity", "after_quantity", "reason", "actor_employee_id", "created_at"},
    "defect_pool_bridges": {"bridge_id", "cutover_id", "source_key", "source_transaction_id", "source_record_id", "scope_key", "original_category", "cutover_category", "cutover_remaining", "observed_epoch", "source_fingerprint", "source_payload"},
}


def _fully_preexisting_schema(bind: sa.Connection) -> bool:
    """Accept an exact unversioned ORM schema; reject partial 2-A markers."""
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    employee_columns = {column["name"] for column in inspector.get_columns("employees")}
    markers = (tables & _EXPECTED_COLUMNS.keys()) or ("pin_version" in employee_columns)
    if not markers:
        return False
    if "pin_version" not in employee_columns or not set(_EXPECTED_COLUMNS) <= tables:
        raise RuntimeError("Partial stocktake foundation schema cannot be adopted")
    for table_name, expected in _EXPECTED_COLUMNS.items():
        actual = {column["name"] for column in inspector.get_columns(table_name)}
        if actual != expected:
            raise RuntimeError(f"Stocktake foundation columns differ: {table_name}")
    return True


def _ensure_legacy_control(bind: sa.Connection) -> None:
    if op.get_context().as_sql:
        op.execute("INSERT INTO stocktake_control (id, inventory_mode, epoch) VALUES (1, 'LEGACY', 0)")
        return
    rows = bind.exec_driver_sql("SELECT id, inventory_mode, active_round_id, epoch FROM stocktake_control").fetchall()
    if not rows:
        bind.exec_driver_sql("INSERT INTO stocktake_control (id, inventory_mode, epoch) VALUES (1, 'LEGACY', 0)")
    elif len(rows) != 1 or tuple(rows[0]) != (1, "LEGACY", None, 0):
        raise RuntimeError("Cannot adopt a non-LEGACY stocktake control row")


def upgrade() -> None:
    """Create isolated future structures and keep current business logic in LEGACY."""
    bind = op.get_bind()
    if not op.get_context().as_sql and _fully_preexisting_schema(bind):
        _ensure_legacy_control(bind)
        return
    op.add_column(
        "employees",
        sa.Column("pin_version", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "inventory_scopes",
        sa.Column("scope_key", sa.String(80), primary_key=True),
        sa.Column("department_id", sa.Integer(), sa.ForeignKey("departments.id", ondelete="RESTRICT"), unique=True),
        sa.Column("physical_department", sa.String(50), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "stocktake_control",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("inventory_mode", sa.String(8), nullable=False, server_default="LEGACY"),
        sa.Column("active_round_id", sa.String(32)),
        sa.Column("epoch", sa.Integer(), nullable=False, server_default="0"),
        sa.CheckConstraint("id = 1", name="ck_stocktake_control_singleton"),
        sa.CheckConstraint("inventory_mode IN ('LEGACY', 'POOL')", name="ck_stocktake_control_mode"),
        sa.CheckConstraint("epoch >= 0", name="ck_stocktake_control_epoch"),
    )
    _ensure_legacy_control(bind)

    op.create_table(
        "operator_sessions",
        sa.Column("session_id", sa.String(32), primary_key=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("employee_id", sa.String(32), sa.ForeignKey("employees.employee_id", ondelete="CASCADE"), nullable=False),
        sa.Column("tab_id", sa.String(100), nullable=False),
        sa.Column("pin_version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime()),
        sa.CheckConstraint("pin_version >= 0", name="ck_operator_session_pin_version"),
    )
    op.create_index("ix_operator_sessions_employee_expires", "operator_sessions", ["employee_id", "expires_at"])

    op.create_table(
        "defect_pool_cutovers",
        sa.Column("cutover_id", sa.String(32), primary_key=True),
        sa.Column("actor_employee_id", sa.String(32), sa.ForeignKey("employees.employee_id", ondelete="RESTRICT"), nullable=False),
        sa.Column("operation_id", sa.String(32), sa.ForeignKey("inventory_operations.operation_id", ondelete="RESTRICT"), nullable=False, unique=True),
        sa.Column("source_fingerprint", sa.String(64), nullable=False, unique=True),
        sa.Column("cutover_version", sa.Integer(), nullable=False),
        sa.Column("performed_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "defect_stock_pools",
        sa.Column("pool_id", sa.String(32), primary_key=True),
        sa.Column("item_id", sa.String(32), sa.ForeignKey("items.item_id", ondelete="RESTRICT"), nullable=False),
        sa.Column("scope_key", sa.String(80), sa.ForeignKey("inventory_scopes.scope_key", ondelete="RESTRICT"), nullable=False),
        sa.Column("category", sa.String(16), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("pending_quantity", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cutover_id", sa.String(32), sa.ForeignKey("defect_pool_cutovers.cutover_id", ondelete="RESTRICT"), nullable=False),
        sa.UniqueConstraint("item_id", "scope_key", "category", name="uq_defect_pool_item_scope_category"),
        sa.CheckConstraint("category IN ('DEFECT', 'B_GRADE', 'OBSOLETE')", name="ck_defect_pool_category"),
        sa.CheckConstraint("quantity >= pending_quantity AND pending_quantity >= 0", name="ck_defect_pool_available"),
        sa.CheckConstraint("version >= 0", name="ck_defect_pool_version"),
    )
    op.create_table(
        "defect_stock_movements",
        sa.Column("movement_id", sa.String(32), primary_key=True),
        sa.Column("pool_id", sa.String(32), sa.ForeignKey("defect_stock_pools.pool_id", ondelete="RESTRICT"), nullable=False),
        sa.Column("operation_id", sa.String(32), sa.ForeignKey("inventory_operations.operation_id", ondelete="RESTRICT"), nullable=False),
        sa.Column("effect_ordinal", sa.Integer(), nullable=False),
        sa.Column("delta", sa.Integer(), nullable=False),
        sa.Column("before_quantity", sa.Integer(), nullable=False),
        sa.Column("after_quantity", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("actor_employee_id", sa.String(32), sa.ForeignKey("employees.employee_id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("operation_id", "effect_ordinal", name="uq_defect_pool_operation_effect"),
        sa.CheckConstraint("delta != 0", name="ck_defect_pool_movement_nonzero"),
        sa.CheckConstraint("before_quantity >= 0 AND after_quantity >= 0", name="ck_defect_pool_movement_nonnegative"),
    )
    op.create_table(
        "defect_pool_bridges",
        sa.Column("bridge_id", sa.String(32), primary_key=True),
        sa.Column("cutover_id", sa.String(32), sa.ForeignKey("defect_pool_cutovers.cutover_id", ondelete="RESTRICT"), nullable=False),
        sa.Column("source_key", sa.String(160), nullable=False),
        sa.Column("source_transaction_id", sa.String(32), sa.ForeignKey("transaction_logs.log_id", ondelete="RESTRICT")),
        sa.Column("source_record_id", sa.String(32), sa.ForeignKey("defect_quarantine_records.record_id", ondelete="RESTRICT")),
        sa.Column("scope_key", sa.String(80), sa.ForeignKey("inventory_scopes.scope_key", ondelete="RESTRICT"), nullable=False),
        sa.Column("original_category", sa.String(16)),
        sa.Column("cutover_category", sa.String(16)),
        sa.Column("cutover_remaining", sa.Integer(), nullable=False),
        sa.Column("observed_epoch", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("source_fingerprint", sa.String(64), nullable=False),
        sa.Column("source_payload", sa.JSON(), nullable=False),
        sa.UniqueConstraint("cutover_id", "source_key", name="uq_defect_pool_bridge_source"),
        sa.CheckConstraint("cutover_remaining >= 0", name="ck_defect_pool_bridge_remaining"),
    )
    op.create_index("ix_defect_pool_bridge_transaction", "defect_pool_bridges", ["source_transaction_id"])
    op.create_index("ix_defect_pool_bridge_record", "defect_pool_bridges", ["source_record_id"])


def downgrade() -> None:
    """A cutover has no safe schema-only rollback; restore the verified DB copy."""
    raise RuntimeError("Stocktake downgrade is unsafe; restore a verified database copy")
