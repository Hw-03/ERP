"""Persist research internal-use BOM modes and approval targets."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260820_0024"
down_revision: Union[str, None] = "20260819_0023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {
    "kind": "data-change",
    "allowed_tables": ["io_bundles", "io_lines", "stock_requests"],
    "validator_sql": (
        "SELECT "
        "(SELECT COUNT(*) FROM io_bundles AS bundle "
        "JOIN io_batches AS batch ON batch.batch_id = bundle.batch_id "
        "WHERE batch.work_type = 'internal_use' "
        "AND (bundle.source_location IS NULL "
        "OR (bundle.source_kind = 'bom_parent' "
        "AND bundle.internal_use_bom_mode IS NULL))) + "
        "(SELECT COUNT(*) FROM io_lines WHERE selected IS NULL) + "
        "(SELECT COUNT(*) FROM stock_requests "
        "WHERE requires_department_approval = TRUE "
        "AND approval_department IS NULL)"
    ),
    "validator_expected": 0,
}


def _columns(table_name: str) -> set[str]:
    if context.is_offline_mode():
        return set()
    return {
        column["name"]
        for column in sa.inspect(op.get_bind()).get_columns(table_name)
    }


def _indexes(table_name: str) -> set[str]:
    if context.is_offline_mode():
        return set()
    return {
        index["name"]
        for index in sa.inspect(op.get_bind()).get_indexes(table_name)
    }


def upgrade() -> None:
    if "internal_use_bom_mode" not in _columns("io_bundles"):
        op.add_column(
            "io_bundles",
            sa.Column("internal_use_bom_mode", sa.String(length=32), nullable=True),
        )
    if "source_location" not in _columns("io_bundles"):
        op.add_column(
            "io_bundles",
            sa.Column("source_location", sa.String(length=20), nullable=True),
        )
    if "selected" not in _columns("io_lines"):
        op.add_column(
            "io_lines",
            sa.Column(
                "selected",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            ),
        )
    if "approval_department" not in _columns("stock_requests"):
        op.add_column(
            "stock_requests",
            sa.Column("approval_department", sa.String(length=50), nullable=True),
        )
    if "ix_stock_requests_approval_department" not in _indexes("stock_requests"):
        op.create_index(
            "ix_stock_requests_approval_department",
            "stock_requests",
            ["approval_department"],
            unique=False,
        )

    if context.is_offline_mode():
        return

    op.execute("UPDATE io_lines SET selected = included")
    op.execute(
        """
        UPDATE io_bundles
        SET source_location = CASE
            WHEN EXISTS (
                SELECT 1
                FROM io_lines AS line
                WHERE line.bundle_id = io_bundles.bundle_id
                  AND line.from_bucket = 'production'
            ) THEN 'department'
            ELSE 'warehouse'
        END
        WHERE EXISTS (
            SELECT 1
            FROM io_batches AS batch
            WHERE batch.batch_id = io_bundles.batch_id
              AND batch.work_type = 'internal_use'
              AND batch.sub_type = 'internal_use_out'
        )
        """
    )
    op.execute(
        """
        UPDATE io_bundles
        SET internal_use_bom_mode = 'children_only'
        WHERE source_kind = 'bom_parent'
          AND EXISTS (
              SELECT 1
              FROM io_batches AS batch
              WHERE batch.batch_id = io_bundles.batch_id
                AND batch.work_type = 'internal_use'
                AND batch.sub_type = 'internal_use_out'
          )
        """
    )
    op.execute(
        "UPDATE stock_requests "
        "SET approval_department = requester_department "
        "WHERE requires_department_approval = TRUE "
        "AND approval_department IS NULL"
    )


def downgrade() -> None:
    raise RuntimeError("연구 사용출고 BOM 차감 방식 이력의 downgrade는 지원하지 않습니다.")
