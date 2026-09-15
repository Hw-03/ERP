"""Add AS/research internal-use approval roles and request decisions."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260915_0034"
down_revision: Union[str, None] = "20260910_0033"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {
    "kind": "data-change",
    "allowed_tables": ["employees"],
    "validator_sql": (
        "SELECT COUNT(*) FROM employees "
        "WHERE employee_code IN ('E02', 'E03') AND as_research_approver <> 1"
    ),
    "validator_expected": 0,
}


def _columns(table_name: str) -> set[str]:
    if context.is_offline_mode():
        return set()
    return {
        column["name"]
        for column in sa.inspect(op.get_bind()).get_columns(table_name)
    }


def upgrade() -> None:
    employee_columns = _columns("employees")
    if context.is_offline_mode() or "as_research_approver" not in employee_columns:
        op.add_column(
            "employees",
            sa.Column(
                "as_research_approver",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )

    request_columns = _columns("stock_requests")
    if context.is_offline_mode() or "requires_as_research_approval" not in request_columns:
        op.add_column(
            "stock_requests",
            sa.Column(
                "requires_as_research_approval",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )
    for column in (
        sa.Column("as_research_approved_by_employee_id", sa.String(length=32), nullable=True),
        sa.Column("as_research_approved_by_name", sa.String(length=100), nullable=True),
        sa.Column("as_research_approved_at", sa.DateTime(), nullable=True),
    ):
        if context.is_offline_mode() or column.name not in request_columns:
            op.add_column("stock_requests", column)

    if context.is_offline_mode():
        op.create_foreign_key(
            "fk_stock_requests_as_research_approved_by_employee_id",
            "stock_requests",
            "employees",
            ["as_research_approved_by_employee_id"],
            ["employee_id"],
            ondelete="SET NULL",
        )
    else:
        bind = op.get_bind()
        inspector = sa.inspect(bind)
        has_foreign_key = any(
            foreign_key["referred_table"] == "employees"
            and foreign_key["constrained_columns"]
            == ["as_research_approved_by_employee_id"]
            for foreign_key in inspector.get_foreign_keys("stock_requests")
        )
        if not has_foreign_key:
            with op.batch_alter_table("stock_requests") as batch_op:
                batch_op.create_foreign_key(
                    "fk_stock_requests_as_research_approved_by_employee_id",
                    "employees",
                    ["as_research_approved_by_employee_id"],
                    ["employee_id"],
                    ondelete="SET NULL",
                )

        bind.execute(
            sa.text(
                "UPDATE employees SET as_research_approver = :enabled "
                "WHERE employee_code IN ('E02', 'E03')"
            ),
            {"enabled": True},
        )


def downgrade() -> None:
    raise RuntimeError("AS·연구 사용출고 승인 마이그레이션 downgrade는 지원하지 않습니다.")
