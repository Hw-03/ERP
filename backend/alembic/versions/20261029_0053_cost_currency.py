"""Preserve foreign purchase inputs alongside the existing KRW standard price."""
from alembic import context, op
import sqlalchemy as sa
from sqlalchemy.schema import CreateColumn

revision = "20261029_0053"
down_revision = "20261029_0052"
branch_labels = None
depends_on = None
EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}


def upgrade() -> None:
    """Add columns without rebuilding SQLite's generated item codes."""
    columns = [
        sa.Column("purchase_currency", sa.String(3), nullable=False, server_default="KRW"),
        sa.Column("foreign_purchase_price", sa.Numeric(18, 2), sa.CheckConstraint(
            "foreign_purchase_price >= 0 OR foreign_purchase_price IS NULL", name="ck_items_foreign_purchase_price_nonneg"), nullable=True),
        sa.Column("purchase_exchange_rate", sa.Numeric(12, 6), sa.CheckConstraint(
            "purchase_exchange_rate > 0 OR purchase_exchange_rate IS NULL", name="ck_items_purchase_exchange_rate_positive"), nullable=True),
    ]
    existing = {} if context.is_offline_mode() else {c["name"]: c for c in sa.inspect(op.get_bind()).get_columns("items")}
    checks = [] if context.is_offline_mode() else sa.inspect(op.get_bind()).get_check_constraints("items")
    for column in columns:
        if column.name in existing:
            actual = existing[column.name]
            compatible = actual["nullable"] == column.nullable and actual["type"]._type_affinity == column.type._type_affinity
            if isinstance(column.type, sa.Numeric):
                compatible = compatible and actual["type"].precision == column.type.precision and actual["type"].scale == column.type.scale
            else:
                compatible = compatible and actual["type"].length == 3 and str(actual["default"]).strip("'\"") == "KRW"
            compatible = compatible and all(any(c["name"] == check.name and c["sqltext"].strip() == str(check.sqltext) for c in checks) for check in column.constraints)
            if not compatible:
                raise RuntimeError(f"items.{column.name} is incompatible; repair the schema before upgrade")
            continue
        ddl = str(CreateColumn(column).compile(dialect=op.get_context().dialect))
        op.execute(f"ALTER TABLE items ADD COLUMN {ddl}")


def downgrade() -> None:
    """Remove only the foreign source fields, retaining stored KRW standards."""
    for name in ("purchase_exchange_rate", "foreign_purchase_price", "purchase_currency"):
        op.drop_column("items", name)
