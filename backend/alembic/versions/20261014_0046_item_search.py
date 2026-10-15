"""Add empty staff maintained item search configuration tables."""
from alembic import context, op
import sqlalchemy as sa

revision = "20261014_0046"
down_revision = "20261014_0045"
branch_labels = None
depends_on = None
EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}


def _already_complete() -> bool:
    """Allow the project's metadata-first onboarding only for a complete schema."""
    if context.is_offline_mode():
        return False
    inspector = sa.inspect(op.get_bind())
    expected = {
        "item_aliases": {"alias_id": 32, "item_id": 32, "alias": 200, "normalized_alias": 200},
        "item_synonym_groups": {"group_id": 32, "version": None},
        "item_synonym_terms": {"term_id": 32, "group_id": 32, "term": 200, "normalized_term": 200},
    }
    present = set(inspector.get_table_names()) & set(expected)
    if not present:
        return False
    if present != set(expected):
        raise RuntimeError("Item search schema is incomplete; manual schema repair required")
    for table, specification in expected.items():
        columns = {column["name"]: column for column in inspector.get_columns(table)}
        if set(columns) != set(specification) or any(column["nullable"] for column in columns.values()):
            raise RuntimeError(f"Incompatible item search columns: {table}; manual schema repair required")
        for name, length in specification.items():
            type_ = columns[name]["type"]
            if (length is None and not isinstance(type_, sa.Integer)) or (length is not None and
                    (not isinstance(type_, sa.String) or type_.length != length)):
                raise RuntimeError(f"Incompatible item search column type: {table}.{name}")
    for table, columns in [("item_aliases", ["item_id", "normalized_alias"]),
                           ("item_synonym_terms", ["normalized_term"])]:
        if not any(row["column_names"] == columns for row in inspector.get_unique_constraints(table)):
            raise RuntimeError(f"Missing item search uniqueness: {table}")
    for table, column, parent, parent_column in [("item_aliases", "item_id", "items", "item_id"),
                                                ("item_synonym_terms", "group_id", "item_synonym_groups", "group_id")]:
        if not any(row["constrained_columns"] == [column] and row["referred_table"] == parent
                   and row["referred_columns"] == [parent_column] and row["options"].get("ondelete") == "CASCADE"
                   for row in inspector.get_foreign_keys(table)):
            raise RuntimeError(f"Missing item search foreign key: {table}")
        if not any(row["column_names"] == [column] for row in inspector.get_indexes(table)):
            raise RuntimeError(f"Missing item search lookup index: {table}")
    for table, column in [("item_aliases", "alias_id"), ("item_synonym_groups", "group_id"),
                          ("item_synonym_terms", "term_id")]:
        if inspector.get_pk_constraint(table)["constrained_columns"] != [column]:
            raise RuntimeError(f"Missing item search primary key: {table}")
    return True


def upgrade() -> None:
    """No search terms or aliases are seeded."""
    if _already_complete():
        return
    op.create_table("item_aliases",
        sa.Column("alias_id", sa.String(32), primary_key=True),
        sa.Column("item_id", sa.String(32), sa.ForeignKey("items.item_id", ondelete="CASCADE"), nullable=False),
        sa.Column("alias", sa.String(200), nullable=False),
        sa.Column("normalized_alias", sa.String(200), nullable=False),
        sa.UniqueConstraint("item_id", "normalized_alias", name="uq_item_alias_normalized"))
    op.create_index("ix_item_aliases_item_id", "item_aliases", ["item_id"])
    op.create_table("item_synonym_groups",
        sa.Column("group_id", sa.String(32), primary_key=True),
        sa.Column("version", sa.Integer(), nullable=False))
    op.create_table("item_synonym_terms",
        sa.Column("term_id", sa.String(32), primary_key=True),
        sa.Column("group_id", sa.String(32), sa.ForeignKey("item_synonym_groups.group_id", ondelete="CASCADE"), nullable=False),
        sa.Column("term", sa.String(200), nullable=False),
        sa.Column("normalized_term", sa.String(200), nullable=False),
        sa.UniqueConstraint("normalized_term"))
    op.create_index("ix_item_synonym_terms_group_id", "item_synonym_terms", ["group_id"])


def downgrade() -> None:
    """Drop dependents first so both supported databases retain FK integrity."""
    op.drop_table("item_synonym_terms")
    op.drop_table("item_synonym_groups")
    op.drop_table("item_aliases")
