"""Add BOM-only inventory exclusion for selected materials."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260818_0021"
down_revision: Union[str, None] = "20260813_0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {
    "kind": "data-change",
    "allowed_tables": ["items"],
    "validator_sql": (
        "SELECT COUNT(*) FROM items "
        "WHERE mes_code = '346-HR-0024' AND COALESCE(bom_stock_exempt, 0) <> 1"
    ),
    "validator_expected": 0,
}


def _columns(table_name: str) -> set[str]:
    if context.is_offline_mode():
        return set()
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    if "bom_stock_exempt" not in _columns("items"):
        op.add_column(
            "items",
            sa.Column("bom_stock_exempt", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    if "bom_stock_exempt" not in _columns("io_lines"):
        op.add_column(
            "io_lines",
            sa.Column("bom_stock_exempt", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    op.execute(
        "UPDATE items SET bom_stock_exempt = TRUE WHERE mes_code = '346-HR-0024'"
    )


def downgrade() -> None:
    raise RuntimeError("BOM 재고 미반영 이력의 downgrade는 지원하지 않습니다.")
