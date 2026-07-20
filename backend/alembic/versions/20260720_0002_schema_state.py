"""Alembic onboarding provenance and schema fingerprint checkpoint."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260720_0002"
down_revision: Union[str, None] = "20260715_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the singleton infrastructure record used by bootstrap checks."""

    op.create_table(
        "alembic_schema_state",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("profile_id", sa.String(length=64), nullable=False),
        sa.Column("revision", sa.String(length=32), nullable=False),
        sa.Column("schema_fingerprint", sa.String(length=64), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("id = 1", name="ck_alembic_schema_state_singleton"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    """Refuse to erase the schema provenance checkpoint."""

    raise RuntimeError("schema-state downgrade is disabled")
