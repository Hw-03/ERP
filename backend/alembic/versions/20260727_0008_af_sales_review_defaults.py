"""Enable sales review for all AF items."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "20260727_0008"
down_revision: Union[str, None] = "20260728_0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {
    "kind": "data-change",
    "allowed_tables": ["items"],
    "validator_sql": (
        "SELECT COUNT(*) FROM items "
        "WHERE process_type_code = 'AF' AND COALESCE(sales_review_required, 0) <> 1"
    ),
    "validator_expected": 0,
}


def upgrade() -> None:
    op.execute(
        "UPDATE items SET sales_review_required = TRUE "
        "WHERE process_type_code = 'AF'"
    )


def downgrade() -> None:
    raise RuntimeError("AF sales-review backfill downgrade is disabled")
