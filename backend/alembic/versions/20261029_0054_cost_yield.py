"""Persist explicitly entered cost yields without seeding historical assumptions."""
from alembic import context, op
import sqlalchemy as sa
from sqlalchemy.schema import CreateColumn

revision = "20261029_0054"
down_revision = "20261029_0053"
branch_labels = None
depends_on = None
EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}
CHECK = "standard_yield_percent > 0 AND standard_yield_percent <= 100 OR standard_yield_percent IS NULL"


def upgrade() -> None:
    """SQLite ADD COLUMN preserves generated codes and all existing business rows."""
    if not context.is_offline_mode():
        inspector = sa.inspect(op.get_bind())
        existing = next((c for c in inspector.get_columns("items") if c["name"] == "standard_yield_percent"), None)
        if existing:
            if (existing["nullable"] and isinstance(existing["type"], sa.Numeric)
                    and existing["type"].precision == 5 and existing["type"].scale == 2
                    and any(c["name"] == "ck_items_standard_yield_range" and c["sqltext"].strip() == CHECK for c in inspector.get_check_constraints("items"))):
                return
            raise RuntimeError("Incompatible standard_yield_percent column")
    column = sa.Column("standard_yield_percent", sa.Numeric(5, 2), sa.CheckConstraint(CHECK, name="ck_items_standard_yield_range"), nullable=True)
    op.execute(f"ALTER TABLE items ADD COLUMN {CreateColumn(column).compile(dialect=op.get_context().dialect)}")


def downgrade() -> None:
    """Remove only the optional yield criterion."""
    op.drop_column("items", "standard_yield_percent")
