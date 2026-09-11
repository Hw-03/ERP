"""Add defect quarantine management categories and append-only history."""

from __future__ import annotations

import uuid
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260910_0033"
down_revision: Union[str, None] = "20260903_0032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {
    "kind": "data-change",
    "allowed_tables": [
        "defect_quarantine_records",
        "defect_quarantine_management_category_revisions",
    ],
    "validator_sql": (
        "SELECT "
        "(SELECT COUNT(*) FROM defect_quarantine_records "
        "WHERE management_category IS NULL "
        "OR management_category NOT IN ('DEFECT', 'B_GRADE', 'OBSOLETE')) + "
        "(SELECT COUNT(*) FROM defect_quarantine_records AS record "
        "WHERE (SELECT COUNT(*) "
        "FROM defect_quarantine_management_category_revisions AS revision "
        "WHERE revision.record_id = record.record_id "
        "AND revision.is_initial = 1) <> 1 "
        "OR NOT EXISTS (SELECT 1 "
        "FROM defect_quarantine_management_category_revisions AS revision "
        "WHERE revision.record_id = record.record_id "
        "AND revision.is_initial = 1 "
        "AND revision.next_category = record.management_category))"
    ),
    "validator_expected": 0,
}


def _columns(table_name: str) -> set[str]:
    if context.is_offline_mode():
        return set()
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _tables() -> set[str]:
    if context.is_offline_mode():
        return set()
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes(table_name: str) -> set[str]:
    if context.is_offline_mode():
        return set()
    return {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)}


def _create_revisions_table() -> None:
    op.create_table(
        "defect_quarantine_management_category_revisions",
        sa.Column("revision_id", sa.String(length=32), nullable=False),
        sa.Column("record_id", sa.String(length=32), nullable=False),
        sa.Column("previous_category", sa.String(length=16), nullable=True),
        sa.Column("next_category", sa.String(length=16), nullable=False),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column("edited_by_employee_id", sa.String(length=32), nullable=True),
        sa.Column("edited_by_name", sa.String(length=100), nullable=False),
        sa.Column("edited_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("is_initial", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.ForeignKeyConstraint(["record_id"], ["defect_quarantine_records.record_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["edited_by_employee_id"], ["employees.employee_id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("revision_id"),
    )


def _backfill_initial_revisions() -> None:
    bind = op.get_bind()
    records = bind.execute(sa.text(
        "SELECT record_id, management_category, current_memo, quarantined_by_employee_id, "
        "quarantined_by_name, quarantined_at FROM defect_quarantine_records"
    )).mappings()
    for record in records:
        exists = bind.execute(sa.text(
            "SELECT 1 FROM defect_quarantine_management_category_revisions "
            "WHERE record_id = :record_id AND is_initial = :is_initial"
        ), {"record_id": record["record_id"], "is_initial": True}).first()
        if exists:
            continue
        bind.execute(sa.text(
            "INSERT INTO defect_quarantine_management_category_revisions "
            "(revision_id, record_id, previous_category, next_category, memo, "
            "edited_by_employee_id, edited_by_name, edited_at, is_initial) VALUES "
            "(:revision_id, :record_id, NULL, :next_category, :memo, "
            ":actor_employee_id, :actor_name, :edited_at, :is_initial)"
        ), {
            "revision_id": uuid.uuid4().hex,
            "record_id": record["record_id"],
            "next_category": record["management_category"] or "DEFECT",
            "memo": record["current_memo"],
            "actor_employee_id": record["quarantined_by_employee_id"],
            "actor_name": record["quarantined_by_name"] or "시스템",
            "edited_at": record["quarantined_at"],
            "is_initial": True,
        })


def upgrade() -> None:
    if "management_category" not in _columns("defect_quarantine_records"):
        op.add_column(
            "defect_quarantine_records",
            sa.Column("management_category", sa.String(length=16), nullable=False, server_default="DEFECT"),
        )
    if not context.is_offline_mode():
        op.get_bind().execute(sa.text(
            "UPDATE defect_quarantine_records SET management_category = 'DEFECT' "
            "WHERE management_category IS NULL OR management_category = ''"
        ))
    if "ix_defect_quarantine_records_management_category" not in _indexes("defect_quarantine_records"):
        op.create_index(
            "ix_defect_quarantine_records_management_category",
            "defect_quarantine_records", ["management_category"],
        )
    if "defect_quarantine_management_category_revisions" not in _tables():
        _create_revisions_table()
    if "ix_defect_quarantine_management_category_revisions_record_id" not in _indexes("defect_quarantine_management_category_revisions"):
        op.create_index(
            "ix_defect_quarantine_management_category_revisions_record_id",
            "defect_quarantine_management_category_revisions", ["record_id"],
        )
    if not context.is_offline_mode():
        _backfill_initial_revisions()


def downgrade() -> None:
    raise RuntimeError("불량 격리 관리 분류 이력의 downgrade는 지원하지 않습니다.")
