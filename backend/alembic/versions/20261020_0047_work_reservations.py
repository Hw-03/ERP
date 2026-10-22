"""Add draft reservation snapshots and audit ledgers without acquiring stock."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.schema import CreateColumn


revision = "20261020_0047"
down_revision = "20261014_0046"
branch_labels = None
depends_on = None
EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}

BATCH_CHECKS = {
    "ck_io_batch_revision_nonneg": "revision >= 0",
    "ck_io_batch_reservation_status": "reservation_status IN ('reserved', 'needs_reservation', 'not_required', 'inactive')",
}


def _batch_columns() -> list[sa.Column]:
    """Keep migration columns independent of future ORM changes."""
    return [
        sa.Column("revision", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reservation_status", sa.String(24), nullable=False, server_default="needs_reservation"),
        sa.Column("reservation_issue", sa.JSON(), nullable=True),
        sa.Column("effective_plan", sa.JSON(), nullable=True),
        sa.Column("creation_payload_hash", sa.String(64), nullable=True),
    ]


def _ledger_tables() -> tuple[sa.Table, sa.Table]:
    """Declare a fixed replay contract and DDL for both supported dialects."""
    metadata = sa.MetaData()
    for name, key in [("io_batches", "batch_id"), ("items", "item_id"), ("employees", "employee_id")]:
        sa.Table(name, metadata, sa.Column(key, sa.String(32), primary_key=True))
    reservations = sa.Table(
        "io_draft_reservations", metadata,
        sa.Column("reservation_id", sa.String(32), primary_key=True),
        sa.Column("batch_id", sa.String(32), sa.ForeignKey("io_batches.batch_id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("item_id", sa.String(32), sa.ForeignKey("items.item_id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("source_bucket", sa.String(20), nullable=False),
        sa.Column("source_department", sa.String(50), nullable=False, server_default=""),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("batch_id", "item_id", "source_bucket", "source_department", name="uq_io_draft_reservation_cell"),
        sa.CheckConstraint("quantity > 0", name="ck_io_draft_reservation_quantity"),
        sa.CheckConstraint("(source_bucket = 'warehouse' AND source_department = '') OR (source_bucket = 'production' AND source_department <> '' AND source_department = trim(source_department))", name="ck_io_draft_reservation_source"),
    )
    events = sa.Table(
        "io_work_reservation_events", metadata,
        sa.Column("event_id", sa.String(32), primary_key=True),
        sa.Column("batch_id", sa.String(32), sa.ForeignKey("io_batches.batch_id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("actor_employee_id", sa.String(32), sa.ForeignKey("employees.employee_id", ondelete="SET NULL"), nullable=True),
        sa.Column("actor_name", sa.String(100), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("from_revision", sa.Integer(), nullable=False),
        sa.Column("to_revision", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("from_revision >= 0 AND to_revision > from_revision", name="ck_io_work_event_revisions"),
    )
    return reservations, events


def _sql(value: object) -> str:
    """Normalize dialect reflection whitespace and outer parentheses."""
    return " ".join(str(value).strip().strip("()").split()).lower()


def _validate_columns(inspector: sa.Inspector, table_name: str, expected: list[sa.Column]) -> None:
    """Reject incompatible preexisting types, defaults and nullability."""
    actual = {column["name"]: column for column in inspector.get_columns(table_name)}
    for column in expected:
        row = actual.get(column.name)
        if row is None or row["nullable"] != column.nullable:
            raise RuntimeError(f"Work reservation columns differ: {table_name}.{column.name}")
        if row["type"]._type_affinity is not column.type._type_affinity or getattr(row["type"], "length", None) != getattr(column.type, "length", None):
            raise RuntimeError(f"Work reservation column type differs: {table_name}.{column.name}")
        expected_default = None if column.server_default is None else str(column.server_default.arg.compile(dialect=inspector.bind.dialect)) if hasattr(column.server_default.arg, "compile") else "'" + str(column.server_default.arg) + "'"
        if _sql(row.get("default")) != _sql(expected_default):
            raise RuntimeError(f"Work reservation default differs: {table_name}.{column.name}")


def _already_complete() -> bool:
    """Adopt metadata-first schemas only when every reservation marker agrees."""
    if op.get_context().as_sql:
        return False
    inspector = sa.inspect(op.get_bind())
    table_names = set(inspector.get_table_names())
    batch_columns = _batch_columns()
    current_columns = {column["name"] for column in inspector.get_columns("io_batches")}
    ledgers = _ledger_tables()
    expected_tables = {table.name for table in ledgers}
    markers = (expected_tables & table_names) or ({column.name for column in batch_columns} & current_columns)
    if not markers:
        return False
    if not expected_tables <= table_names:
        raise RuntimeError("Work reservation schema is incomplete; manual schema repair required")
    actual_checks = {row["name"]: _sql(row["sqltext"]) for row in inspector.get_check_constraints("io_batches")}
    expected_checks = dict(BATCH_CHECKS)
    # Metadata-first bootstrap may already carry the 0048 contract. Accept
    # only its complete default/CHECK pair; historical 0047 DDL stays fixed.
    latest_check = "reservation_status IN ('reserved', 'not_required', 'inactive')"
    if actual_checks.get("ck_io_batch_reservation_status") == _sql(latest_check):
        batch_columns = [sa.Column("reservation_status", sa.String(24), nullable=False, server_default="inactive") if column.name == "reservation_status" else column for column in batch_columns]
        expected_checks["ck_io_batch_reservation_status"] = latest_check
    _validate_columns(inspector, "io_batches", batch_columns)
    if any(actual_checks.get(name) != _sql(sql) for name, sql in expected_checks.items()):
        raise RuntimeError("Work reservation batch checks differ")
    if not any(row["name"] == "ix_io_batches_reservation_status" and row["column_names"] == ["reservation_status"] and not row["unique"] for row in inspector.get_indexes("io_batches")):
        raise RuntimeError("Work reservation batch lookup index is missing")
    for table in ledgers:
        if {row["name"] for row in inspector.get_columns(table.name)} != set(table.columns.keys()):
            raise RuntimeError(f"Work reservation ledger columns differ: {table.name}")
        _validate_columns(inspector, table.name, list(table.columns))
        if inspector.get_pk_constraint(table.name)["constrained_columns"] != [column.name for column in table.primary_key]:
            raise RuntimeError(f"Work reservation primary key differs: {table.name}")
        expected_checks = {_sql(check.sqltext) for check in table.constraints if isinstance(check, sa.CheckConstraint)}
        if {_sql(row["sqltext"]) for row in inspector.get_check_constraints(table.name)} != expected_checks:
            raise RuntimeError(f"Work reservation checks differ: {table.name}")
        expected_unique = {tuple(column.name for column in constraint.columns) for constraint in table.constraints if isinstance(constraint, sa.UniqueConstraint)}
        if {tuple(row["column_names"]) for row in inspector.get_unique_constraints(table.name)} != expected_unique:
            raise RuntimeError(f"Work reservation uniqueness differs: {table.name}")
        for index in table.indexes:
            if not any(row["name"] == index.name and row["column_names"] == [column.name for column in index.columns] and bool(row["unique"]) == index.unique for row in inspector.get_indexes(table.name)):
                raise RuntimeError(f"Work reservation lookup index is missing: {table.name}")
        for foreign_key in table.foreign_keys:
            if not any(row["constrained_columns"] == [foreign_key.parent.name] and row["referred_table"] == foreign_key.column.table.name and row["referred_columns"] == [foreign_key.column.name] and row["options"].get("ondelete") == foreign_key.ondelete for row in inspector.get_foreign_keys(table.name)):
                raise RuntimeError(f"Work reservation foreign key differs: {table.name}")
    return True


def upgrade() -> None:
    """Mark old work for explicit conversion, leaving all stock and ledgers alone."""
    if _already_complete():
        return
    if op.get_context().dialect.name == "sqlite":
        # Rebuilding this parent would cascade old bundles when FK enforcement
        # is on, and SQLite reflection loses older inline FK delete actions.
        for column in _batch_columns():
            if column.name == "revision":
                column = sa.Column(column.name, column.type, sa.CheckConstraint(BATCH_CHECKS["ck_io_batch_revision_nonneg"], name="ck_io_batch_revision_nonneg"), nullable=False, server_default="0")
            elif column.name == "reservation_status":
                column = sa.Column(column.name, column.type, sa.CheckConstraint(BATCH_CHECKS["ck_io_batch_reservation_status"], name="ck_io_batch_reservation_status"), nullable=False, server_default="needs_reservation")
            ddl = str(CreateColumn(column).compile(dialect=op.get_context().dialect))
            op.execute(f"ALTER TABLE io_batches ADD COLUMN {ddl}")
    else:
        for column in _batch_columns():
            op.add_column("io_batches", column)
        for name, sql in BATCH_CHECKS.items():
            op.create_check_constraint(name, "io_batches", sql)
    op.create_index("ix_io_batches_reservation_status", "io_batches", ["reservation_status"])
    batches = sa.table("io_batches", sa.column("status", sa.String(24)), sa.column("reservation_status", sa.String(24)), sa.column("reservation_issue", sa.JSON()))
    legacy_issue = sa.literal_column("'{\"code\":\"legacy_unprocessed\",\"message\":\"Explicit reservation conversion required\",\"shortages\":[]}'")
    op.execute(batches.update().where(batches.c.status == "draft").values(reservation_status="needs_reservation", reservation_issue=legacy_issue))
    op.execute(batches.update().where(batches.c.status != "draft").values(reservation_status="inactive"))
    for table in _ledger_tables():
        table.create(op.get_bind())


def downgrade() -> None:
    """Require an online empty-ledger check; never leave pending without its owner."""
    if op.get_context().as_sql:
        raise RuntimeError("Work reservation state cannot be checked offline; use an online downgrade or restore a verified backup")
    if op.get_bind().execute(sa.text("SELECT 1 FROM io_draft_reservations LIMIT 1")).first() is not None:
        raise RuntimeError("Cannot downgrade with active work reservations; release them through the application before retrying")
    op.drop_table("io_work_reservation_events")
    op.drop_table("io_draft_reservations")
    op.drop_index("ix_io_batches_reservation_status", table_name="io_batches")
    if op.get_context().dialect.name != "sqlite":
        for name in BATCH_CHECKS:
            op.drop_constraint(name, "io_batches", type_="check")
    for column in reversed(_batch_columns()):
        op.drop_column("io_batches", column.name)
