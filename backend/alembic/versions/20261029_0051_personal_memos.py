"""Add empty per-employee memo storage without changing work or stock records."""

from alembic import context, op
import sqlalchemy as sa


revision = "20261029_0051"
down_revision = "20261023_0050"
branch_labels = None
depends_on = None
EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}


def _existing_table_is_compatible(bind: sa.Connection) -> bool:
    """Accept metadata-first setup only when the complete private schema exists."""
    inspector = sa.inspect(bind)
    columns = {column["name"]: column for column in inspector.get_columns("personal_memos")}
    if set(columns) != {"employee_id", "content", "updated_at"}:
        return False
    if any(column["nullable"] for column in columns.values()):
        return False
    employee_type = columns["employee_id"]["type"]
    if not isinstance(employee_type, sa.String) or employee_type.length != 32:
        return False
    if not isinstance(columns["content"]["type"], sa.Text) or not isinstance(columns["updated_at"]["type"], sa.DateTime):
        return False
    if inspector.get_pk_constraint("personal_memos")["constrained_columns"] != ["employee_id"]:
        return False
    return any(
        foreign_key["constrained_columns"] == ["employee_id"]
        and foreign_key["referred_table"] == "employees"
        and foreign_key["referred_columns"] == ["employee_id"]
        and foreign_key["options"].get("ondelete", "").upper() == "CASCADE"
        for foreign_key in inspector.get_foreign_keys("personal_memos")
    )


def upgrade() -> None:
    """Only create the empty table; historical daily reports stay independent."""
    if not context.is_offline_mode():
        bind = op.get_bind()
        if "personal_memos" in sa.inspect(bind).get_table_names():
            if _existing_table_is_compatible(bind):
                return
            raise RuntimeError("personal_memos existing table does not match the expected schema")
    op.create_table(
        "personal_memos",
        sa.Column("employee_id", sa.String(32), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("employee_id"),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.employee_id"], ondelete="CASCADE"),
    )


def downgrade() -> None:
    """Require a verified backup instead of silently discarding private text."""
    raise RuntimeError("personal memo downgrade is disabled; restore the verified database backup")
