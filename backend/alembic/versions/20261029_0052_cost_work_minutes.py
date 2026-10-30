"""Add optional per-person unit work minutes without inventing historical times."""

from alembic import context, op
import sqlalchemy as sa
from sqlalchemy.schema import CreateColumn


revision = "20261029_0052"
down_revision = "20261029_0051"
branch_labels = None
depends_on = None
EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}
CHECK_NAME = "ck_items_standard_work_minutes_nonneg"
CHECK_SQL = "standard_work_minutes >= 0 OR standard_work_minutes IS NULL"


def upgrade() -> None:
    """Inline checks allow SQLite ADD COLUMN without copying generated columns."""
    if not context.is_offline_mode():
        inspector = sa.inspect(op.get_bind())
        column = next((col for col in inspector.get_columns("items") if col["name"] == "standard_work_minutes"), None)
        if column is not None:
            checks = inspector.get_check_constraints("items")
            if (column["nullable"] and isinstance(column["type"], sa.Numeric)
                    and column["type"].precision == 12 and column["type"].scale == 2
                    and any(check["name"] == CHECK_NAME and check["sqltext"].strip() == CHECK_SQL for check in checks)):
                return
            raise RuntimeError("items.standard_work_minutes is incompatible; repair the schema before upgrade")
    column = sa.Column("standard_work_minutes", sa.Numeric(12, 2),
                       sa.CheckConstraint(CHECK_SQL, name=CHECK_NAME), nullable=True)
    ddl = str(CreateColumn(column).compile(dialect=op.get_context().dialect))
    op.execute(f"ALTER TABLE items ADD COLUMN {ddl}")


def downgrade() -> None:
    """Drop only the added column; SQLite preserves existing generated columns."""
    op.drop_column("items", "standard_work_minutes")
