"""Separate warehouse and tube suppliers while preserving all references."""
from __future__ import annotations

from alembic import context, op
import sqlalchemy as sa

revision = "20261008_0041"
down_revision = "20261007_0040"
branch_labels = None
depends_on = None

EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}


def _add_scope() -> None:
    """Replace global name uniqueness with scope uniqueness using reflected schema."""
    bind = op.get_bind()
    inspector = None if context.is_offline_mode() else sa.inspect(bind)
    constraints = inspector.get_unique_constraints("suppliers") if inspector is not None else [{"name": "uq_suppliers_normalized_name", "column_names": ["normalized_name"]}]
    indexes = inspector.get_indexes("suppliers") if inspector is not None else []
    has_scope = inspector is not None and any(column["name"] == "scope" for column in inspector.get_columns("suppliers"))
    has_scoped_unique = any(constraint["column_names"] == ["scope", "normalized_name"] for constraint in constraints)
    has_scope_check = inspector is not None and any(constraint["name"] == "ck_suppliers_scope" for constraint in inspector.get_check_constraints("suppliers"))
    with op.batch_alter_table("suppliers", naming_convention={"uq": "uq_%(table_name)s_%(column_0_name)s"}) as batch:
        if not has_scope:
            batch.add_column(sa.Column("scope", sa.String(20), nullable=False, server_default="warehouse"))
        for constraint in constraints:
            if constraint["column_names"] == ["normalized_name"]:
                batch.drop_constraint(constraint["name"] or "uq_suppliers_normalized_name", type_="unique")
        for index in indexes:
            if index.get("unique") and not index.get("duplicates_constraint") and index["column_names"] == ["normalized_name"]:
                batch.drop_index(index["name"])
        if not has_scoped_unique:
            batch.create_unique_constraint("uq_suppliers_scope_normalized_name", ["scope", "normalized_name"])
        if not has_scope_check:
            batch.create_check_constraint("ck_suppliers_scope", "scope IN ('warehouse', 'tube')")


def _supplier_references(bind: sa.Connection) -> list[tuple[str, str, list[str], list[tuple[object, ...]]]]:
    """Snapshot nullable direct references before replacing the SQLite parent."""
    inspector = sa.inspect(bind)
    references = []
    quote = bind.dialect.identifier_preparer.quote
    for name in inspector.get_table_names():
        for fk in inspector.get_foreign_keys(name):
            if fk["referred_table"] != "suppliers":
                continue
            columns = fk["constrained_columns"]
            if len(columns) != 1:
                raise RuntimeError("Supplier scope migration requires a single-column supplier reference")
            column = columns[0]
            table_columns = {value["name"]: value for value in inspector.get_columns(name)}
            primary_keys = list(inspector.get_pk_constraint(name)["constrained_columns"])
            if not table_columns[column]["nullable"] or not primary_keys:
                raise RuntimeError(f"Supplier scope migration requires nullable references and a primary key: {name}")
            selected = ", ".join(quote(value) for value in [*primary_keys, column])
            # Historical UUID columns can have NUMERIC affinity despite containing
            # UUID text. Bypass reflected SQLAlchemy numeric result processors.
            rows = [tuple(row) for row in bind.exec_driver_sql(f"SELECT {selected} FROM {quote(name)} WHERE {quote(column)} IS NOT NULL")]
            references.append((name, column, primary_keys, rows))
    return references


def upgrade() -> None:
    """Preserve nullable FK values inside the caller's existing bootstrap transaction."""
    bind = op.get_bind()
    previous_fk_errors = {tuple(row) for row in bind.exec_driver_sql("PRAGMA foreign_key_check")} if bind.dialect.name == "sqlite" else set()
    references = _supplier_references(bind) if bind.dialect.name == "sqlite" else []
    quote = bind.dialect.identifier_preparer.quote
    # RESTRICT and CASCADE references cannot point at the parent while SQLite
    # replaces it. Temporarily detach only FK values, retaining every child row.
    for table, column, primary_keys, rows in references:
        if rows:
            bind.exec_driver_sql(f"UPDATE {quote(table)} SET {quote(column)} = NULL WHERE {quote(column)} IS NOT NULL")
    _add_scope()
    for table, column, primary_keys, rows in references:
        if rows:
            condition = " AND ".join(f"{quote(key)} = ?" for key in primary_keys)
            bind.exec_driver_sql(f"UPDATE {quote(table)} SET {quote(column)} = ? WHERE {condition}", [(row[-1], *row[:-1]) for row in rows])
    if bind.dialect.name == "sqlite":
        current_fk_errors = {tuple(row) for row in bind.exec_driver_sql("PRAGMA foreign_key_check")}
        if current_fk_errors - previous_fk_errors:
            raise RuntimeError("Supplier scope migration introduced foreign key errors")


def downgrade() -> None:
    """Retain scope because merging duplicate names would destroy supplier history."""
    raise RuntimeError("Supplier scope downgrade requires explicit data reconciliation")
