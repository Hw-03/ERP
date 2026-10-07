"""Remove employee grades without changing independent approval assignments."""
from __future__ import annotations

from alembic import context, op
import sqlalchemy as sa

revision: str = "20261007_0039"
down_revision: str = "20260928_0038"
branch_labels = None
depends_on = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {
    "kind": "data-preserving",
    "removed_columns": {"employees": ["level"]},
}


def upgrade() -> None:
    """Native column removal keeps employee IDs, FK targets and every other value."""
    connection = op.get_bind()
    if connection.dialect.name == "sqlite":
        version = tuple(int(part) for part in connection.exec_driver_sql("SELECT sqlite_version()").scalar_one().split("."))
        if version < (3, 35, 0):
            raise RuntimeError("Employee grade removal requires SQLite 3.35.0 or newer")
        if "level" in {column["name"] for column in sa.inspect(connection).get_columns("employees")}:
            connection.exec_driver_sql("ALTER TABLE employees DROP COLUMN level")
    elif connection.dialect.name == "postgresql":
        if context.is_offline_mode() or "level" in {column["name"] for column in sa.inspect(connection).get_columns("employees")}:
            op.drop_column("employees", "level")
        # RESTRICT prevents silently removing an unexpected consumer of the type.
        op.execute("DROP TYPE IF EXISTS employee_level_enum RESTRICT")
    else:
        raise RuntimeError("Unsupported database for employee grade removal")


def downgrade() -> None:
    """Removed grades cannot be reconstructed; restore a backup with its old code."""
    raise RuntimeError("Restore the pre-migration database backup and matching code; downgrade is unsupported")
