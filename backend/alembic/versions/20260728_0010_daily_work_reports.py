"""Add personal daily work reports."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260728_0010"
down_revision: Union[str, None] = "20260727_0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_REQUIRED_COLUMNS = {
    "report_id",
    "work_date",
    "employee_id",
    "employee_name",
    "department",
    "content",
    "created_at",
    "updated_at",
}
_REQUIRED_INDEXES = {
    "ix_daily_work_reports_work_date",
    "ix_daily_work_reports_employee_id",
}


def _existing_table_is_compatible(bind: sa.Connection) -> bool:
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("daily_work_reports")}
    if not _REQUIRED_COLUMNS.issubset(columns):
        return False
    if inspector.get_pk_constraint("daily_work_reports").get("constrained_columns") != ["report_id"]:
        return False
    if not any(
        foreign_key["constrained_columns"] == ["employee_id"]
        and foreign_key["referred_table"] == "employees"
        and foreign_key["referred_columns"] == ["employee_id"]
        and foreign_key.get("options", {}).get("ondelete", "").upper() == "RESTRICT"
        for foreign_key in inspector.get_foreign_keys("daily_work_reports")
    ):
        return False
    if not any(
        constraint["column_names"] == ["employee_id", "work_date"]
        for constraint in inspector.get_unique_constraints("daily_work_reports")
    ):
        return False
    return _REQUIRED_INDEXES.issubset(
        {index["name"] for index in inspector.get_indexes("daily_work_reports")}
    )


def upgrade() -> None:
    if not context.is_offline_mode():
        bind = op.get_bind()
        if "daily_work_reports" in sa.inspect(bind).get_table_names():
            if _existing_table_is_compatible(bind):
                return
            raise RuntimeError("daily_work_reports existing table does not match the expected schema")
    op.create_table(
        "daily_work_reports",
        sa.Column("report_id", sa.String(length=32), nullable=False),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("employee_id", sa.String(length=32), nullable=False),
        sa.Column("employee_name", sa.String(length=100), nullable=False),
        sa.Column("department", sa.String(length=50), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.employee_id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("report_id"),
        sa.UniqueConstraint("employee_id", "work_date", name="uq_daily_work_reports_employee_date"),
    )
    op.create_index("ix_daily_work_reports_work_date", "daily_work_reports", ["work_date"])
    op.create_index("ix_daily_work_reports_employee_id", "daily_work_reports", ["employee_id"])


def downgrade() -> None:
    raise RuntimeError("daily work report downgrade is disabled")
