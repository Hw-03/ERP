"""Add display submission identifiers and preserve defect reason snapshots."""

from __future__ import annotations

import re
import unicodedata
import uuid

from alembic import context, op
import sqlalchemy as sa


revision: str = "20261007_0039"
down_revision: str = "20260928_0038"
branch_labels = None
depends_on = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {
    "kind": "data-change",
    "allowed_tables": ["defect_reason_categories", "defect_quarantine_records", "transaction_logs", "stock_requests"],
    "validator_sql": (
        "SELECT (SELECT COUNT(*) FROM defect_quarantine_records r LEFT JOIN defect_reason_categories c ON c.category_id=r.reason_category_id WHERE r.reason_category_id IS NOT NULL AND c.category_id IS NULL) "
        "+ (SELECT COUNT(*) FROM transaction_logs r LEFT JOIN defect_reason_categories c ON c.category_id=r.reason_category_id WHERE r.reason_category_id IS NOT NULL AND c.category_id IS NULL) "
        "+ (SELECT COUNT(*) FROM stock_requests r LEFT JOIN defect_reason_categories c ON c.category_id=r.reason_category_id WHERE r.reason_category_id IS NOT NULL AND c.category_id IS NULL)"
    ),
    "validator_expected": 0,
}

# Freeze seed and UUID contracts here so future model changes cannot alter history upgrades.
DEFAULT_NAMES = (
    "외관 불량", "치수 불량", "기능 불량", "검사 통과", "누유", "이물질", "고압",
    "10A", "선광불량", "mA 불량", "KV 불량", "파형 불량", "기타",
)
CATEGORY_NAMESPACE = uuid.UUID("09d4f985-54b0-5d11-b9d9-30bf2606baaf")
SUBMISSION_NAMESPACE = uuid.UUID("2242e165-5e07-5fd4-a138-47a031a7e46b")
QUARANTINE_BULK_KEY = re.compile(
    r"^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(0|[1-9][0-9]*)$"
)
REASON_TABLES = ("defect_quarantine_records", "transaction_logs", "stock_requests", "io_batches")
LEGACY_REASON_TABLES = REASON_TABLES[:3]


def _normalize(name: str) -> str:
    """Collapse Unicode presentation and case without changing snapshots."""
    return unicodedata.normalize("NFKC", name).strip().casefold()


def _category(name: str, *, active: bool) -> dict[str, object]:
    """Derive stable IDs for defaults and retained legacy selection names."""
    normalized = _normalize(name)
    return {
        "category_id": uuid.uuid5(CATEGORY_NAMESPACE, normalized).hex,
        "name": name,
        "normalized_name": normalized,
        "is_active": active,
        "is_other": normalized == "기타",
    }


def _add_reason_foreign_key(table: str) -> None:
    """SQLite inline FK addition preserves all parent and dependent rows."""
    if context.get_context().dialect.name == "sqlite":
        op.execute(
            f"ALTER TABLE {table} ADD COLUMN reason_category_id VARCHAR(32) "
            f"CONSTRAINT fk_{table}_reason_category_id "
            "REFERENCES defect_reason_categories (category_id) ON DELETE RESTRICT"
        )
    else:
        op.add_column(
            table,
            sa.Column(
                "reason_category_id", sa.String(32),
                sa.ForeignKey("defect_reason_categories.category_id", name=f"fk_{table}_reason_category_id", ondelete="RESTRICT"),
                nullable=True,
            ),
        )
    op.create_index(f"ix_{table}_reason_category_id", table, ["reason_category_id"])


def _backfill_reasons(bind: sa.Connection, category_table: sa.Table) -> None:
    """Retain every nonblank historical name as inactive without truncation."""
    known = {_normalize(name): _category(name, active=True)["category_id"] for name in DEFAULT_NAMES}
    for table in LEGACY_REASON_TABLES:
        names = bind.execute(sa.text(f"SELECT DISTINCT reason_category FROM {table} WHERE reason_category IS NOT NULL ORDER BY reason_category")).scalars()
        for name in names:
            normalized = _normalize(name)
            if not normalized:
                continue
            if normalized not in known:
                category = _category(name, active=False)
                bind.execute(category_table.insert(), category)
                known[normalized] = category["category_id"]
            bind.execute(
                sa.text(f"UPDATE {table} SET reason_category_id=:category_id WHERE reason_category=:name"),
                {"category_id": known[normalized], "name": name},
            )


def _backfill_submissions(bind: sa.Connection) -> None:
    """Attach only explicit IO batches and exact old bulk quarantine keys."""
    bind.execute(sa.text(
        "UPDATE transaction_logs SET submission_id=operation_batch_id "
        "WHERE operation_batch_id IS NOT NULL AND reverses_log_id IS NULL"
    ))
    bind.execute(sa.text(
        "UPDATE stock_requests SET submission_id=operation_batch_id WHERE operation_batch_id IS NOT NULL"
    ))
    logs = bind.execute(sa.text(
        "SELECT log_id, client_request_id FROM transaction_logs "
        "WHERE submission_id IS NULL AND transaction_type='MARK_DEFECTIVE' "
        "AND defect_quarantine_record_id IS NOT NULL AND reverses_log_id IS NULL "
        "AND client_request_id IS NOT NULL"
    )).mappings()
    for log in logs:
        match = QUARANTINE_BULK_KEY.fullmatch(log["client_request_id"])
        if match is not None:
            bind.execute(
                sa.text("UPDATE transaction_logs SET submission_id=:submission_id WHERE log_id=:log_id"),
                {"submission_id": uuid.uuid5(SUBMISSION_NAMESPACE, match.group(1)).hex, "log_id": log["log_id"]},
            )


def _require_columns(
    inspector: sa.Inspector,
    table: str,
    expected: dict[str, tuple[type[sa.types.TypeEngine], int | None, bool]],
) -> None:
    """Do not recognize a partial or incompatible schema as a completed replay."""
    columns = {column["name"]: column for column in inspector.get_columns(table)}
    for name, (type_class, length, nullable) in expected.items():
        column = columns.get(name)
        if (
            column is None or bool(column["nullable"]) != nullable
            or not isinstance(column["type"], type_class)
            or (length is not None and column["type"].length != length)
        ):
            raise RuntimeError(f"{table}.{name} is incompatible; manual schema repair is required before upgrade")


def _require_index(inspector: sa.Inspector, table: str, column: str) -> None:
    """A replay still requires the indexed lookup contract of this revision."""
    matches = [index for index in inspector.get_indexes(table) if index["name"] == f"ix_{table}_{column}"]
    if len(matches) != 1 or matches[0]["column_names"] != [column] or matches[0]["unique"]:
        raise RuntimeError(f"{table}.{column} index is incompatible; manual schema repair is required before upgrade")


def _assert_completed_schema(bind: sa.Connection, inspector: sa.Inspector) -> None:
    """Validate all added columns, indexes and FK actions before preserving data."""
    master = "defect_reason_categories"
    _require_columns(inspector, master, {
        "category_id": (sa.String, 32, False), "name": (sa.Text, None, False),
        "normalized_name": (sa.Text, None, False), "is_active": (sa.Boolean, None, False),
        "is_other": (sa.Boolean, None, False), "created_at": (sa.DateTime, None, False),
        "updated_at": (sa.DateTime, None, False),
    })
    if inspector.get_pk_constraint(master).get("constrained_columns") != ["category_id"]:
        raise RuntimeError("defect_reason_categories primary key is incompatible; manual schema repair is required before upgrade")
    uniques = {
        tuple(constraint["column_names"])
        for constraint in inspector.get_unique_constraints(master)
    } | {
        tuple(index["column_names"])
        for index in inspector.get_indexes(master) if index["unique"]
    }
    if ("normalized_name",) not in uniques:
        raise RuntimeError("defect_reason_categories unique name is incompatible; manual schema repair is required before upgrade")
    _require_index(inspector, master, "is_active")
    for table in REASON_TABLES:
        _require_columns(inspector, table, {"reason_category_id": (sa.String, 32, True)})
        _require_index(inspector, table, "reason_category_id")
        if bind.dialect.name == "sqlite":
            # SQLAlchemy omits inline-FK actions; SQLite itself is authoritative.
            foreign_keys = bind.exec_driver_sql(f'PRAGMA foreign_key_list("{table}")').all()
            matching = [fk for fk in foreign_keys if fk[3] == "reason_category_id"]
            valid = len(matching) == 1 and tuple(matching[0][2:7]) == (
                master, "reason_category_id", "category_id", "NO ACTION", "RESTRICT",
            )
            submission_has_fk = any(fk[3] == "submission_id" for fk in foreign_keys)
        else:
            foreign_keys = inspector.get_foreign_keys(table)
            matching = [fk for fk in foreign_keys if fk["constrained_columns"] == ["reason_category_id"]]
            valid = (
                len(matching) == 1 and matching[0]["referred_table"] == master
                and matching[0]["referred_columns"] == ["category_id"]
                and matching[0]["options"].get("ondelete") == "RESTRICT"
            )
            submission_has_fk = any("submission_id" in fk["constrained_columns"] for fk in foreign_keys)
        if not valid or submission_has_fk:
            raise RuntimeError(f"{table} foreign key is incompatible; manual schema repair is required before upgrade")
        if table in ("transaction_logs", "stock_requests"):
            _require_columns(inspector, table, {"submission_id": (sa.String, 32, True)})
            _require_index(inspector, table, "submission_id")
    if bind.dialect.name == "postgresql":
        for table in REASON_TABLES:
            _require_columns(inspector, table, {"reason_category": (sa.Text, None, True)})
    else:
        _require_columns(inspector, "io_batches", {"reason_category": (sa.String, 100, True)})


def upgrade() -> None:
    """Add nullable links, seed choices, and backfill only explicit evidence."""
    if not context.is_offline_mode():
        bind = op.get_bind()
        inspector = sa.inspect(bind)
        if "defect_reason_categories" in inspector.get_table_names():
            # Unversioned onboarding replays revisions against current schemas.
            # Preserve runtime names, inactive choices, custom IDs and submission links.
            _assert_completed_schema(bind, inspector)
            return
    op.create_table(
        "defect_reason_categories",
        sa.Column("category_id", sa.String(32), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("normalized_name", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_other", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("category_id"),
        sa.UniqueConstraint("normalized_name", name="uq_defect_reason_categories_normalized_name"),
    )
    op.create_index("ix_defect_reason_categories_is_active", "defect_reason_categories", ["is_active"])
    if context.get_context().dialect.name == "postgresql":
        for table in LEGACY_REASON_TABLES:
            op.alter_column(table, "reason_category", type_=sa.Text(), existing_nullable=True)
    for table in REASON_TABLES:
        _add_reason_foreign_key(table)
    snapshot_type = sa.Text() if context.get_context().dialect.name == "postgresql" else sa.String(100)
    op.add_column("io_batches", sa.Column("reason_category", snapshot_type, nullable=True))
    for table in ("transaction_logs", "stock_requests"):
        op.add_column(table, sa.Column("submission_id", sa.String(32), nullable=True))
        op.create_index(f"ix_{table}_submission_id", table, ["submission_id"])
    category_table = sa.table(
        "defect_reason_categories",
        sa.column("category_id", sa.String(32)), sa.column("name", sa.Text()),
        sa.column("normalized_name", sa.Text()), sa.column("is_active", sa.Boolean()),
        sa.column("is_other", sa.Boolean()),
    )
    op.bulk_insert(category_table, [_category(name, active=True) for name in DEFAULT_NAMES])
    if not context.is_offline_mode():
        bind = op.get_bind()
        _backfill_reasons(bind, category_table)
        _backfill_submissions(bind)


def downgrade() -> None:
    """Do not discard durable identifiers attached to historical records."""
    raise RuntimeError("History submission and defect reason downgrade is not supported.")
