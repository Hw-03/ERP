"""Add current work pause tokens without rewriting drafts or reserving stock."""
from alembic import op
import sqlalchemy as sa


revision = "20261023_0049"
down_revision = "20261021_0048"
branch_labels = None
depends_on = None
EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}
TABLE = "stocktake_work_pauses"
KIND_CHECK = "kind IN ('io', 'stock_request')"


def _table() -> sa.Table:
    """Keep historical DDL independent of future ORM changes."""
    metadata = sa.MetaData()
    sa.Table("stocktake_rounds", metadata, sa.Column("round_id", sa.String(32), primary_key=True))
    return sa.Table(
        TABLE, metadata,
        sa.Column("kind", sa.String(24), primary_key=True),
        sa.Column("work_id", sa.String(32), primary_key=True),
        sa.Column("round_id", sa.String(32), sa.ForeignKey("stocktake_rounds.round_id", ondelete="RESTRICT"), nullable=False),
        sa.Column("token", sa.String(32), nullable=False),
        sa.Column("required_cells", sa.JSON(), nullable=False),
        sa.Column("paused_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(KIND_CHECK, name="ck_stocktake_work_pause_kind"),
    )


def _adopt_existing(table: sa.Table) -> bool:
    """Adopt metadata-first bootstraps only when the complete table agrees."""
    if op.get_context().as_sql:
        return False
    inspector = sa.inspect(op.get_bind())
    if TABLE not in inspector.get_table_names():
        return False
    actual = {column["name"]: column for column in inspector.get_columns(TABLE)}
    valid = set(actual) == set(table.columns.keys())
    for column in table.columns:
        row = actual.get(column.name)
        expected_default = None if column.server_default is None else str(column.server_default.arg.compile(dialect=inspector.bind.dialect))
        valid = valid and row is not None and (
            row["nullable"] == column.nullable
            and row["type"]._type_affinity is column.type._type_affinity
            and getattr(row["type"], "length", None) == getattr(column.type, "length", None)
            and str(row.get("default")).strip("()").lower() == str(expected_default).strip("()").lower()
        )
    valid = valid and inspector.get_pk_constraint(TABLE)["constrained_columns"] == ["kind", "work_id"]
    checks = {row["name"]: " ".join(row["sqltext"].split()) for row in inspector.get_check_constraints(TABLE)}
    valid = valid and checks == {"ck_stocktake_work_pause_kind": KIND_CHECK}
    foreign_keys = inspector.get_foreign_keys(TABLE)
    valid = valid and len(foreign_keys) == 1 and any(
        row["constrained_columns"] == ["round_id"] and row["referred_table"] == "stocktake_rounds"
        and row["referred_columns"] == ["round_id"] and row["options"].get("ondelete") == "RESTRICT"
        for row in foreign_keys
    )
    if not valid:
        raise RuntimeError("Stocktake work pause schema differs; manual schema repair required")
    return True


def upgrade() -> None:
    """Add only the active pause table; saved work remains untouched."""
    table = _table()
    if not _adopt_existing(table):
        table.create(op.get_bind())


def downgrade() -> None:
    """Require verified empty fences before removing the isolated table."""
    if op.get_context().as_sql:
        raise RuntimeError("Work pauses require an online downgrade to verify empty fences")
    if op.get_bind().execute(sa.text(f"SELECT 1 FROM {TABLE} LIMIT 1")).first():
        raise RuntimeError("Cannot downgrade active work pauses; resume or remove saved work first")
    op.drop_table(TABLE)
