"""Add the nullable item purchase memo."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260903_0031"
down_revision: Union[str, None] = "20260902_0030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}


def upgrade() -> None:
    if not context.is_offline_mode():
        columns = {
            column["name"]: column
            for column in sa.inspect(op.get_bind()).get_columns("items")
        }
        existing = columns.get("purchase_memo")
        if existing is not None:
            column_type = existing["type"]
            if (
                existing.get("nullable")
                and isinstance(column_type, sa.String)
                and column_type.length == 1000
            ):
                return
            raise RuntimeError(
                "items.purchase_memo is incompatible; manual schema repair is "
                "required before upgrade"
            )

    op.add_column(
        "items",
        sa.Column("purchase_memo", sa.String(length=1000), nullable=True),
    )


def downgrade() -> None:
    raise RuntimeError("품목 구매 메모 스키마의 downgrade는 지원하지 않습니다.")
