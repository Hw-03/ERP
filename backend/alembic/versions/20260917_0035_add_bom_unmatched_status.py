"""Add nullable BOM unmatched review fields to items."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260917_0035"
down_revision: Union[str, None] = "20260915_0034"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}

_FIELDS = {
    "bom_unmatched_status": 20,
    "pre_disused_legacy_item_type": 50,
}


def upgrade() -> None:
    existing_columns: dict[str, dict[str, object]] = {}
    if not context.is_offline_mode():
        existing_columns = {
            column["name"]: column
            for column in sa.inspect(op.get_bind()).get_columns("items")
        }

    for name, length in _FIELDS.items():
        existing = existing_columns.get(name)
        if existing is not None:
            column_type = existing["type"]
            if (
                existing.get("nullable")
                and isinstance(column_type, sa.String)
                and column_type.length == length
            ):
                continue
            raise RuntimeError(
                f"items.{name} is incompatible; manual schema repair is "
                "required before upgrade"
            )
        op.add_column(
            "items",
            sa.Column(name, sa.String(length=length), nullable=True),
        )


def downgrade() -> None:
    raise RuntimeError("BOM 미매칭 상태 스키마의 downgrade는 지원하지 않습니다.")
