"""Add DB-backed mobile assembly checklist templates."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20260724_0004"
down_revision: Union[str, None] = "20260720_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create checklist template, section, and ordered-item tables."""

    existing_tables = set() if context.is_offline_mode() else set(sa.inspect(op.get_bind()).get_table_names())

    if "assembly_checklists" not in existing_tables:
        op.create_table(
            "assembly_checklists",
            sa.Column("checklist_id", sa.String(length=32), nullable=False),
            sa.Column("model_slot", sa.SmallInteger(), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["model_slot"], ["product_symbols.slot"], ondelete="RESTRICT"),
            sa.PrimaryKeyConstraint("checklist_id"),
            sa.UniqueConstraint("model_slot", name="uq_assembly_checklists_model_slot"),
        )
        op.create_index("ix_assembly_checklists_model_slot", "assembly_checklists", ["model_slot"])

    if "assembly_checklist_sections" not in existing_tables:
        op.create_table(
            "assembly_checklist_sections",
            sa.Column("section_id", sa.String(length=32), nullable=False),
            sa.Column("checklist_id", sa.String(length=32), nullable=False),
            sa.Column("title", sa.String(length=80), nullable=True),
            sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["checklist_id"], ["assembly_checklists.checklist_id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("section_id"),
        )
        op.create_index("ix_assembly_checklist_sections_checklist_id", "assembly_checklist_sections", ["checklist_id"])

    if "assembly_checklist_items" not in existing_tables:
        op.create_table(
            "assembly_checklist_items",
            sa.Column("item_id", sa.String(length=32), nullable=False),
            sa.Column("section_id", sa.String(length=32), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["section_id"], ["assembly_checklist_sections.section_id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("item_id"),
        )
        op.create_index("ix_assembly_checklist_items_section_id", "assembly_checklist_items", ["section_id"])



def downgrade() -> None:
    """Do not erase checklist templates from a production database."""

    raise RuntimeError("assembly checklist downgrade is disabled")
