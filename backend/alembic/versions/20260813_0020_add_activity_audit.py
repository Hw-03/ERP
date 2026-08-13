"""Add persistent user activity audit snapshots."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260813_0020"
down_revision: Union[str, None] = "20260812_0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}

EXPECTED_COLUMNS = {
    "audit_terminals": {"terminal_id", "name", "created_at", "updated_at"},
    "activity_audit_logs": {
        "audit_id",
        "occurred_at",
        "actor_employee_name",
        "actor_employee_code",
        "terminal_id",
        "terminal_name",
        "source",
        "session_id",
        "screen_key",
        "screen_label",
        "action_key",
        "action_label",
        "outcome",
        "target_summary",
        "request_id",
        "related_id",
    },
}


def _compatible_tables_already_exist() -> bool:
    if context.is_offline_mode():
        return False
    inspector = sa.inspect(op.get_bind())
    existing = set(inspector.get_table_names()) & set(EXPECTED_COLUMNS)
    if not existing:
        return False
    if existing != set(EXPECTED_COLUMNS):
        raise RuntimeError("activity audit schema is partially present")
    for table_name, expected in EXPECTED_COLUMNS.items():
        actual = {column["name"] for column in inspector.get_columns(table_name)}
        missing = expected - actual
        if missing:
            raise RuntimeError(
                f"{table_name} is missing activity audit columns: {sorted(missing)}"
            )
    return True


def upgrade() -> None:
    if _compatible_tables_already_exist():
        return
    op.create_table(
        "audit_terminals",
        sa.Column("terminal_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("terminal_id"),
    )
    op.create_table(
        "activity_audit_logs",
        sa.Column("audit_id", sa.String(length=32), nullable=False),
        sa.Column("occurred_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("actor_employee_name", sa.String(length=100), nullable=True),
        sa.Column("actor_employee_code", sa.String(length=30), nullable=True),
        sa.Column("terminal_id", sa.String(length=36), nullable=True),
        sa.Column("terminal_name", sa.String(length=80), nullable=False),
        sa.Column("source", sa.String(length=10), nullable=False),
        sa.Column("session_id", sa.String(length=120), nullable=True),
        sa.Column("screen_key", sa.String(length=120), nullable=True),
        sa.Column("screen_label", sa.String(length=120), nullable=True),
        sa.Column("action_key", sa.String(length=160), nullable=False),
        sa.Column("action_label", sa.String(length=120), nullable=False),
        sa.Column("outcome", sa.String(length=10), nullable=False),
        sa.Column("target_summary", sa.Text(), nullable=True),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("related_id", sa.String(length=120), nullable=True),
        sa.CheckConstraint(
            "source IN ('desktop', 'mobile')",
            name="ck_activity_audit_source",
        ),
        sa.CheckConstraint(
            "outcome IN ('success', 'failed', 'cancelled')",
            name="ck_activity_audit_outcome",
        ),
        sa.PrimaryKeyConstraint("audit_id"),
    )
    op.create_index(
        "ix_activity_audit_logs_occurred_at",
        "activity_audit_logs",
        ["occurred_at"],
    )
    op.create_index(
        "ix_activity_audit_logs_actor_employee_code",
        "activity_audit_logs",
        ["actor_employee_code"],
    )
    op.create_index(
        "ix_activity_audit_logs_terminal_id",
        "activity_audit_logs",
        ["terminal_id"],
    )
    op.create_index(
        "ix_activity_audit_logs_session_id",
        "activity_audit_logs",
        ["session_id"],
    )
    op.create_index(
        "ix_activity_audit_logs_outcome",
        "activity_audit_logs",
        ["outcome"],
    )


def downgrade() -> None:
    raise RuntimeError("activity audit history downgrade is disabled")
