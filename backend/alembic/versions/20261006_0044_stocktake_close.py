"""Publish complete close manifests and immutable close decisions without activation."""
from alembic import op
import sqlalchemy as sa

revision = "20261006_0044"
down_revision = "20261006_0043"
branch_labels = None
depends_on = None
EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}

EXPECTED_COLUMNS = {
    "stocktake_close_manifests": ["chunk_count", "created_at", "header", "manifest_hash", "manifest_id", "round_id", "row_count"],
    "stocktake_close_chunks": ["chunk_hash", "chunk_index", "entries", "manifest_id"],
    "stocktake_close_seals": ["manifest_id", "preview_id", "sealed_at"],
    "stocktake_close_commits": ["actor_id", "actor_name", "applications", "created_at", "manifest_id", "round_id"],
}


def upgrade() -> None:
    """Create only close evidence; canonical onboarding owns pre-existing schema checks."""
    preexisting = False
    if not op.get_context().as_sql:
        inspector = sa.inspect(op.get_bind())
        existing = set(inspector.get_table_names()) & EXPECTED_COLUMNS.keys()
        if existing:
            if existing != EXPECTED_COLUMNS.keys() or any(
                sorted(c["name"] for c in inspector.get_columns(name)) != columns
                for name, columns in EXPECTED_COLUMNS.items()
            ):
                raise RuntimeError("Partial stocktake close schema cannot be adopted")
            preexisting = True
    if not preexisting:
        op.create_table("stocktake_close_manifests",
            sa.Column("manifest_id", sa.String(32), nullable=False),
            sa.Column("round_id", sa.String(32), nullable=False),
            sa.Column("header", sa.JSON(), nullable=False),
            sa.Column("manifest_hash", sa.String(64), nullable=False),
            sa.Column("chunk_count", sa.Integer(), nullable=False),
            sa.Column("row_count", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.CheckConstraint("chunk_count >= 0 AND row_count >= 0", name="ck_stocktake_manifest_size"),
            sa.ForeignKeyConstraint(["round_id"], ["stocktake_rounds.round_id"], ondelete="RESTRICT"),
            sa.PrimaryKeyConstraint("manifest_id"))
        op.create_index("ix_stocktake_close_manifests_round_id", "stocktake_close_manifests", ["round_id"], unique=False)
        op.create_table("stocktake_close_chunks",
            sa.Column("manifest_id", sa.String(32), nullable=False),
            sa.Column("chunk_index", sa.Integer(), nullable=False),
            sa.Column("entries", sa.JSON(), nullable=False),
            sa.Column("chunk_hash", sa.String(64), nullable=False),
            sa.CheckConstraint("chunk_index >= 0", name="ck_stocktake_chunk_index"),
            sa.ForeignKeyConstraint(["manifest_id"], ["stocktake_close_manifests.manifest_id"], ondelete="RESTRICT"),
            sa.PrimaryKeyConstraint("manifest_id", "chunk_index"))
        op.create_table("stocktake_close_seals",
            sa.Column("manifest_id", sa.String(32), nullable=False),
            sa.Column("preview_id", sa.String(32), nullable=False),
            sa.Column("sealed_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["manifest_id"], ["stocktake_close_manifests.manifest_id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["preview_id"], ["stocktake_previews.preview_id"], ondelete="RESTRICT"),
            sa.PrimaryKeyConstraint("manifest_id"),
            sa.UniqueConstraint("preview_id"))
        op.create_table("stocktake_close_commits",
            sa.Column("round_id", sa.String(32), nullable=False),
            sa.Column("manifest_id", sa.String(32), nullable=False),
            sa.Column("actor_id", sa.String(32), nullable=False),
            sa.Column("actor_name", sa.String(100), nullable=False),
            sa.Column("applications", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["round_id"], ["stocktake_rounds.round_id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["manifest_id"], ["stocktake_close_seals.manifest_id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["actor_id"], ["employees.employee_id"], ondelete="RESTRICT"),
            sa.PrimaryKeyConstraint("round_id"),
            sa.UniqueConstraint("manifest_id"))
    _freeze_evidence()
    _guard_publication()


def _freeze_evidence() -> None:
    """Neither normal updates nor SQLite replacement inserts may rewrite evidence."""
    duplicate_keys = {
        "stocktake_close_manifests": "manifest_id = NEW.manifest_id",
        "stocktake_close_chunks": "manifest_id = NEW.manifest_id AND chunk_index = NEW.chunk_index",
        "stocktake_close_seals": "manifest_id = NEW.manifest_id OR preview_id = NEW.preview_id",
        "stocktake_close_commits": "round_id = NEW.round_id OR manifest_id = NEW.manifest_id",
    }
    sqlite = op.get_bind().dialect.name == "sqlite"
    if not sqlite:
        op.execute("""CREATE OR REPLACE FUNCTION stocktake_close_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'stocktake close evidence is immutable'; END; $$""")
    for table, keys in duplicate_keys.items():
        if sqlite:
            for action in ("UPDATE", "DELETE"):
                op.execute(f"CREATE TRIGGER IF NOT EXISTS close_{table}_no_{action.lower()} BEFORE {action} ON {table} BEGIN SELECT RAISE(ABORT, 'stocktake close evidence is immutable'); END")
            op.execute(f"CREATE TRIGGER IF NOT EXISTS close_{table}_no_replace BEFORE INSERT ON {table} WHEN EXISTS (SELECT 1 FROM {table} WHERE {keys}) BEGIN SELECT RAISE(ABORT, 'stocktake close evidence is immutable'); END")
        else:
            op.execute(f"DROP TRIGGER IF EXISTS stocktake_close_immutable ON {table}")
            op.execute(f"CREATE TRIGGER stocktake_close_immutable BEFORE UPDATE OR DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION stocktake_close_immutable()")


def _guard_publication() -> None:
    """A bounded unique index range must be complete before publishing its seal."""
    # The service additionally verifies entry counts and every content/hash link.
    if op.get_bind().dialect.name == "sqlite":
        op.execute("""CREATE TRIGGER IF NOT EXISTS stocktake_close_chunk_insert BEFORE INSERT ON stocktake_close_chunks
            BEGIN
                SELECT CASE WHEN EXISTS (SELECT 1 FROM stocktake_close_chunks WHERE manifest_id = NEW.manifest_id AND chunk_index = NEW.chunk_index)
                    THEN RAISE(ABORT, 'stocktake close evidence is immutable') END;
                SELECT CASE WHEN EXISTS (SELECT 1 FROM stocktake_close_seals WHERE manifest_id = NEW.manifest_id)
                    THEN RAISE(ABORT, 'stocktake close manifest is sealed') END;
                SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM stocktake_close_manifests WHERE manifest_id = NEW.manifest_id AND NEW.chunk_index >= 0 AND NEW.chunk_index < chunk_count)
                    THEN RAISE(ABORT, 'stocktake close chunk index is outside manifest') END;
            END""")
        op.execute("""CREATE TRIGGER IF NOT EXISTS stocktake_close_seal_insert BEFORE INSERT ON stocktake_close_seals
            BEGIN
                SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM stocktake_close_manifests AS manifest WHERE manifest.manifest_id = NEW.manifest_id
                    AND manifest.chunk_count = (SELECT COUNT(*) FROM stocktake_close_chunks WHERE manifest_id = NEW.manifest_id)
                    AND NOT EXISTS (SELECT 1 FROM stocktake_close_chunks WHERE manifest_id = NEW.manifest_id AND (chunk_index < 0 OR chunk_index >= manifest.chunk_count)))
                    THEN RAISE(ABORT, 'stocktake close manifest is incomplete') END;
            END""")
        return
    op.execute("""CREATE OR REPLACE FUNCTION stocktake_close_chunk_insert() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE expected_count INTEGER;
        BEGIN
            SELECT chunk_count INTO expected_count FROM stocktake_close_manifests WHERE manifest_id = NEW.manifest_id FOR UPDATE;
            IF NOT FOUND THEN RAISE EXCEPTION 'stocktake close manifest is missing'; END IF;
            IF EXISTS (SELECT 1 FROM stocktake_close_seals WHERE manifest_id = NEW.manifest_id)
                THEN RAISE EXCEPTION 'stocktake close manifest is sealed'; END IF;
            IF NEW.chunk_index < 0 OR NEW.chunk_index >= expected_count
                THEN RAISE EXCEPTION 'stocktake close chunk index is outside manifest'; END IF;
            RETURN NEW;
        END; $$""")
    op.execute("""CREATE OR REPLACE FUNCTION stocktake_close_seal_insert() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE expected_count INTEGER;
        BEGIN
            SELECT chunk_count INTO expected_count FROM stocktake_close_manifests WHERE manifest_id = NEW.manifest_id FOR UPDATE;
            IF NOT FOUND THEN RAISE EXCEPTION 'stocktake close manifest is incomplete'; END IF;
            IF expected_count <> (SELECT COUNT(*) FROM stocktake_close_chunks WHERE manifest_id = NEW.manifest_id)
                OR EXISTS (SELECT 1 FROM stocktake_close_chunks WHERE manifest_id = NEW.manifest_id AND (chunk_index < 0 OR chunk_index >= expected_count))
                THEN RAISE EXCEPTION 'stocktake close manifest is incomplete'; END IF;
            RETURN NEW;
        END; $$""")
    for table, function in (("stocktake_close_chunks", "stocktake_close_chunk_insert"), ("stocktake_close_seals", "stocktake_close_seal_insert")):
        op.execute(f"DROP TRIGGER IF EXISTS {function} ON {table}")
        op.execute(f"CREATE TRIGGER {function} BEFORE INSERT ON {table} FOR EACH ROW EXECUTE FUNCTION {function}()")


def downgrade() -> None:
    """Close evidence must survive; restoration requires a verified whole snapshot."""
    raise RuntimeError("Restore a verified snapshot; stocktake close evidence cannot be downgraded")
