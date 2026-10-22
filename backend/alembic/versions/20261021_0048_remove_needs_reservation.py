"""Remove the obsolete reservation placeholder without rewriting the parent table."""
from __future__ import annotations

from contextlib import closing
import re
import sqlite3

from alembic import op
import sqlalchemy as sa


revision = "20261021_0048"
down_revision = "20261020_0047"
branch_labels = None
depends_on = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {
    "kind": "data-change",
    "allowed_tables": ["io_batches"],
    "validator_sql": (
        "SELECT COUNT(*) FROM io_batches WHERE reservation_status = 'needs_reservation' "
        "OR json_extract(reservation_issue, '$.code') = 'legacy_unprocessed'"
    ),
    "validator_expected": 0,
}

OLD_CHECK = "reservation_status IN ('reserved', 'needs_reservation', 'not_required', 'inactive')"
NEW_CHECK = "reservation_status IN ('reserved', 'not_required', 'inactive')"
CONFLICT_SQL = (
    "SELECT 1 FROM io_batches AS batch JOIN io_draft_reservations AS reservation "
    "ON reservation.batch_id = batch.batch_id "
    "WHERE batch.reservation_status = 'needs_reservation' LIMIT 1"
)


def _sqlite_definition(definition: str) -> str:
    """Replace only the two known 0047 fragments, then parse in an empty database."""
    # Keep every other byte, including historical inline FK delete actions.
    # Unknown defaults, duplicate/extra status references and custom CHECKs fail closed.
    if len(re.findall(r"\breservation_status\b", definition)) != 2:
        raise RuntimeError("Work reservation schema has unexpected status references")
    for before, after in [("needs_reservation", "inactive"), ("inactive", "inactive")]:
        column = f"reservation_status VARCHAR(24) DEFAULT '{before}' NOT NULL"
        check = f"CONSTRAINT ck_io_batch_reservation_status CHECK ({OLD_CHECK if before == 'needs_reservation' else NEW_CHECK})"
        column_pattern = re.compile(re.escape(column).replace(r"\ ", r"\s+"))
        check_pattern = re.compile(re.escape(check).replace(r"\ ", r"\s+"))
        if len(column_pattern.findall(definition)) == len(check_pattern.findall(definition)) == 1:
            updated = column_pattern.sub(f"reservation_status VARCHAR(24) DEFAULT '{after}' NOT NULL", definition, count=1)
            updated = check_pattern.sub(f"CONSTRAINT ck_io_batch_reservation_status CHECK ({NEW_CHECK})", updated, count=1)
            try:
                with closing(sqlite3.connect(":memory:")) as probe:
                    probe.execute(updated)
                    names = probe.execute("SELECT name FROM sqlite_schema WHERE type='table'").fetchall()
                    if names != [("io_batches",)]:
                        raise RuntimeError("Work reservation schema does not define io_batches")
            except sqlite3.DatabaseError as exc:
                raise RuntimeError("Work reservation schema cannot be parsed safely") from exc
            return updated
    raise RuntimeError("Work reservation schema differs from the supported default/CHECK pair")


def _sqlite_upgrade(bind: sa.Connection) -> None:
    """Use SQLite's schema-edit transaction while retaining all parent/child pages."""
    # SQLAlchemy's SQLite transaction can be logical only until the first DML.
    # Start a real outer transaction so releasing our savepoint cannot commit
    # ahead of Alembic's version update. Existing caller transactions stay owned.
    if not bind.connection.driver_connection.in_transaction:
        bind.exec_driver_sql("BEGIN IMMEDIATE")
    writable_schema = int(bind.exec_driver_sql("PRAGMA writable_schema").scalar_one())
    try:
        with bind.begin_nested():
            definition = bind.exec_driver_sql("SELECT sql FROM sqlite_schema WHERE type='table' AND name='io_batches'").scalar_one()
            updated = _sqlite_definition(definition)
            if bind.exec_driver_sql("SELECT 1 FROM sqlite_schema WHERE type='trigger' AND tbl_name='io_batches' LIMIT 1").first():
                raise RuntimeError("Work reservation schema has custom batch triggers; manual review required")
            if bind.exec_driver_sql(CONFLICT_SQL).first():
                raise RuntimeError("Legacy work has an active reservation; reconcile it before migration")
            bind.exec_driver_sql("UPDATE io_batches SET reservation_status='inactive' WHERE reservation_status='needs_reservation'")
            bind.exec_driver_sql("UPDATE io_batches SET reservation_issue=NULL WHERE json_extract(reservation_issue, '$.code')='legacy_unprocessed'")
            if updated != definition:
                version = int(bind.exec_driver_sql("PRAGMA schema_version").scalar_one())
                if not 0 <= version < 2147483647:
                    raise RuntimeError("Work reservation schema version cannot be incremented")
                # https://www.sqlite.org/lang_altertable.html#otheralter
                # Validate rows with integrity_check after narrowing the CHECK;
                # unlike a table rebuild this never drops the referenced parent.
                bind.exec_driver_sql("PRAGMA writable_schema=ON")
                try:
                    result = bind.execute(sa.text("UPDATE sqlite_schema SET sql=:updated WHERE type='table' AND name='io_batches' AND sql=:original"), {"updated": updated, "original": definition})
                    if result.rowcount != 1:
                        raise RuntimeError("Work reservation schema changed during migration")
                    bind.exec_driver_sql(f"PRAGMA schema_version={version + 1}")
                finally:
                    bind.exec_driver_sql("PRAGMA writable_schema=OFF")
            if bind.exec_driver_sql("PRAGMA integrity_check").all() != [("ok",)]:
                raise RuntimeError("Work reservation schema integrity check failed")
            if bind.exec_driver_sql("PRAGMA foreign_key_check").first():
                raise RuntimeError("Work reservation schema foreign key check failed")
    finally:
        bind.exec_driver_sql(f"PRAGMA writable_schema={writable_schema}")


def _postgresql_upgrade() -> None:
    """Emit transactional DML/DDL, including the ledger guard for offline scripts."""
    op.execute(
        "DO $$ BEGIN IF EXISTS (" + CONFLICT_SQL + ") THEN "
        "RAISE EXCEPTION 'Legacy work has an active reservation; reconcile it before migration'; "
        "END IF; END $$"
    )
    op.execute("UPDATE io_batches SET reservation_status='inactive' WHERE reservation_status='needs_reservation'")
    op.execute("UPDATE io_batches SET reservation_issue=NULL WHERE reservation_issue->>'code'='legacy_unprocessed'")
    op.alter_column("io_batches", "reservation_status", existing_type=sa.String(24), existing_nullable=False, server_default=sa.text("'inactive'"))
    op.drop_constraint("ck_io_batch_reservation_status", "io_batches", type_="check")
    op.create_check_constraint("ck_io_batch_reservation_status", "io_batches", NEW_CHECK)


def upgrade() -> None:
    """Retire the placeholder and its obsolete warning without creating reservations."""
    dialect = op.get_context().dialect.name
    if dialect == "postgresql":
        _postgresql_upgrade()
    elif dialect == "sqlite" and not op.get_context().as_sql:
        _sqlite_upgrade(op.get_bind())
    else:
        raise RuntimeError("Work reservation placeholder removal requires online SQLite or PostgreSQL")


def downgrade() -> None:
    """Removed placeholder/issue meaning is not recoverable from inactive rows."""
    raise RuntimeError("Work reservation downgrade cannot reconstruct removed placeholder state; restore a verified backup")
