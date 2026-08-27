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


def upgrade() -> None:
    offline = context.is_offline_mode()
    if not offline:
        _assert_no_duplicate_quantity_corrections()
        if _correction_index_exists_with_exact_contract():
            return
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
