"""Add CP4 correction and command integrity guards."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260828_0031"
down_revision: Union[str, None] = "20260827_0030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CORRECTION_UNIQUE_INDEX = "uq_transaction_edit_log_quantity_correction"
FINGERPRINT_TABLES = ("io_batches", "stock_requests")
HANDOVER_CANCELLED_ENUM_VALUE = "CANCELLED"

EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}


def _normalize_predicate(predicate: object) -> str:
    return " ".join(
        str(predicate)
        .lower()
        .replace('"', "")
        .replace("(", " ")
        .replace(")", " ")
        .split()
    )


def _correction_index_exists_with_exact_contract() -> bool:
    bind = op.get_bind()
    existing = next(
        (
            index
            for index in sa.inspect(bind).get_indexes("transaction_edit_logs")
            if index["name"] == CORRECTION_UNIQUE_INDEX
        ),
        None,
    )
    if existing is None:
        return False

    dialect = bind.dialect.name
    predicate = (existing.get("dialect_options") or {}).get(
        f"{dialect}_where"
    )
    exact = (
        existing.get("column_names") == ["original_log_id"]
        and bool(existing.get("unique"))
        and _normalize_predicate(predicate)
        == "correction_log_id is not null"
    )
    if not exact:
        raise RuntimeError(
            f"{CORRECTION_UNIQUE_INDEX} exists with an incompatible contract; "
            "automatic index replacement is not allowed"
        )
    return True


def _assert_no_duplicate_quantity_corrections() -> None:
    duplicate = op.get_bind().execute(
        sa.text(
            "SELECT original_log_id FROM transaction_edit_logs "
            "WHERE correction_log_id IS NOT NULL "
            "GROUP BY original_log_id HAVING COUNT(*) > 1 LIMIT 1"
        )
    ).first()
    if duplicate is not None:
        raise RuntimeError(
            "transaction_edit_logs contains duplicate quantity corrections; "
            "automatic legacy cleanup is not allowed"
        )


def _fingerprint_column_exists_with_exact_contract(table_name: str) -> bool:
    column = next(
        (
            candidate
            for candidate in sa.inspect(op.get_bind()).get_columns(table_name)
            if candidate["name"] == "request_fingerprint"
        ),
        None,
    )
    if column is None:
        return False
    column_type = column["type"]
    exact = (
        isinstance(column_type, sa.String)
        and column_type.length == 64
        and bool(column["nullable"])
    )
    if not exact:
        raise RuntimeError(
            f"{table_name}.request_fingerprint exists with an incompatible contract; "
            "automatic column replacement is not allowed"
        )
    return True


def upgrade() -> None:
    offline = context.is_offline_mode()
    existing_fingerprint_columns: dict[str, bool] = {}
    correction_index_exists = False
    if not offline:
        _assert_no_duplicate_quantity_corrections()
        correction_index_exists = _correction_index_exists_with_exact_contract()
        existing_fingerprint_columns = {
            table_name: _fingerprint_column_exists_with_exact_contract(table_name)
            for table_name in FINGERPRINT_TABLES
        }
    if context.get_context().dialect.name == "postgresql":
        op.execute(
            "ALTER TYPE handover_status_enum ADD VALUE IF NOT EXISTS "
            f"'{HANDOVER_CANCELLED_ENUM_VALUE}'"
        )
    for table_name in FINGERPRINT_TABLES:
        if not existing_fingerprint_columns.get(table_name, False):
            op.add_column(
                table_name,
                sa.Column("request_fingerprint", sa.String(length=64), nullable=True),
            )
    if not correction_index_exists:
        predicate = sa.text("correction_log_id IS NOT NULL")
        op.create_index(
            CORRECTION_UNIQUE_INDEX,
            "transaction_edit_logs",
            ["original_log_id"],
            unique=True,
            postgresql_where=predicate,
            sqlite_where=predicate,
        )


def downgrade() -> None:
    op.drop_index(
        CORRECTION_UNIQUE_INDEX,
        table_name="transaction_edit_logs",
    )
    for table_name in reversed(FINGERPRINT_TABLES):
        op.drop_column(table_name, "request_fingerprint")
