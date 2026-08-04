"""Enable sales review for all AF items."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "20260727_0008"
down_revision: Union[str, None] = "20260727_0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE items SET sales_review_required = TRUE "
        "WHERE process_type_code = 'AF'"
    )


def downgrade() -> None:
    raise RuntimeError("AF sales-review backfill downgrade is disabled")
