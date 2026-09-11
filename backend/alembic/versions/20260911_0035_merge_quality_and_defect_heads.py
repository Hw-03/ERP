"""Merge the quality and defect-management migration heads."""

from __future__ import annotations

from typing import Sequence, Union


revision: str = "20260911_0035"
down_revision: Union[str, Sequence[str], None] = (
    "20260907_0034",
    "20260910_0033",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
