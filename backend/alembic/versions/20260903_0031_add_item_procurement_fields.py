"""Add nullable procurement master fields to items."""

from __future__ import annotations

import re
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260903_0031"
down_revision: Union[str, None] = "20260903_0030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}

_CHECKS = {
    "standard_purchase_price": (
        "ck_items_standard_purchase_price_nonneg",
        "standard_purchase_price >= 0 OR standard_purchase_price IS NULL",
    ),
    "procurement_lead_time_days": (
        "ck_items_procurement_lead_time_days_nonneg",
        "procurement_lead_time_days >= 0 OR procurement_lead_time_days IS NULL",
    ),
    "minimum_order_quantity": (
        "ck_items_minimum_order_quantity_positive",
        "minimum_order_quantity >= 1 OR minimum_order_quantity IS NULL",
    ),
    "reorder_point": (
        "ck_items_reorder_point_nonneg",
        "reorder_point >= 0 OR reorder_point IS NULL",
    ),
}


def _columns() -> dict[str, dict[str, object]]:
    if context.is_offline_mode():
        return {}
    return {
        column["name"]: column
        for column in sa.inspect(op.get_bind()).get_columns("items")
    }


def _is_compatible(name: str, column: dict[str, object]) -> bool:
    column_type = column["type"]
    if not column.get("nullable"):
        return False
    if name == "supplier_item_code":
        return isinstance(column_type, sa.String) and column_type.length == 100
    if name == "standard_purchase_price":
        return (
            isinstance(column_type, sa.Numeric)
            and column_type.precision == 18
            and column_type.scale == 2
        )
    if name == "purchase_price_effective_date":
        return isinstance(column_type, sa.Date)
    return isinstance(column_type, sa.Integer)


def _column(name: str) -> sa.Column:
    if name == "supplier_item_code":
        return sa.Column(name, sa.String(length=100), nullable=True)
    if name == "standard_purchase_price":
        return sa.Column(
            name,
            sa.Numeric(precision=18, scale=2),
            sa.CheckConstraint(_CHECKS[name][1], name=_CHECKS[name][0]),
            nullable=True,
        )
    if name == "purchase_price_effective_date":
        return sa.Column(name, sa.Date(), nullable=True)
    return sa.Column(
        name,
        sa.Integer(),
        sa.CheckConstraint(_CHECKS[name][1], name=_CHECKS[name][0]),
        nullable=True,
    )


def _normalize_check_sql(sql: object) -> str:
    """Compare reflected CHECK SQL without accepting a changed predicate."""
    normalized = re.sub(r"::[a-z_ ]+(?:\[\])?", "", str(sql).lower())
    normalized = re.sub(r'[\s()"`]', "", normalized)
    return normalized


def _checks_are_compatible(inspector: sa.Inspector) -> bool:
    actual = {
        check["name"]: _normalize_check_sql(check["sqltext"])
        for check in inspector.get_check_constraints("items")
    }
    return all(
        actual.get(constraint_name) == _normalize_check_sql(sql)
        for constraint_name, sql in _CHECKS.values()
    )


def upgrade() -> None:
    names = (
        "supplier_item_code",
        "standard_purchase_price",
        "purchase_price_effective_date",
        "procurement_lead_time_days",
        "minimum_order_quantity",
        "reorder_point",
    )
    if not context.is_offline_mode():
        columns = _columns()
        existing = {name for name in names if name in columns}
        if existing:
            inspector = sa.inspect(op.get_bind())
            if (
                existing == set(names)
                and all(_is_compatible(name, columns[name]) for name in names)
                and _checks_are_compatible(inspector)
            ):
                return
            raise RuntimeError(
                "items procurement fields are partially present or incompatible; "
                "manual schema repair is required before upgrade"
            )

    for name in names:
        op.add_column("items", _column(name))


def downgrade() -> None:
    raise RuntimeError("품목 구매 마스터 스키마의 downgrade는 지원하지 않습니다.")
