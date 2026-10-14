"""Link reservations to pools and freeze committed POOL evidence, without cutover."""

from alembic import context, op
import sqlalchemy as sa


revision = "20261001_0040"
down_revision = "20261001_0039"
branch_labels = None
depends_on = None
EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}
IMMUTABLE_TABLES = ("defect_stock_movements", "defect_pool_bridges", "defect_pool_cutovers")


def upgrade() -> None:
    """Only add compatible structures; all source data and LEGACY mode remain intact."""
    bind = op.get_bind()
    offline = context.is_offline_mode()
    columns = set() if offline else {col["name"] for col in sa.inspect(bind).get_columns("stock_request_lines")}
    if "pool_id" not in columns:
        if bind.dialect.name == "sqlite":
            # SQLAlchemy cannot reflect ON DELETE on an inline SQLite FK. This
            # leaf table has no incoming FKs; batch-copy preserves existing rows.
            with op.batch_alter_table("stock_request_lines") as batch:
                batch.add_column(sa.Column("pool_id", sa.String(32), nullable=True))
                batch.create_foreign_key("fk_stock_request_lines_pool", "defect_stock_pools",
                    ["pool_id"], ["pool_id"], ondelete="RESTRICT")
        else:
            op.add_column("stock_request_lines", sa.Column("pool_id", sa.String(32), sa.ForeignKey("defect_stock_pools.pool_id", ondelete="RESTRICT")))
        op.create_index("ix_stock_request_lines_pool_id", "stock_request_lines", ["pool_id"])
    if bind.dialect.name == "sqlite":
        for table in IMMUTABLE_TABLES:
            for action in ("UPDATE", "DELETE"):
                op.execute(f"CREATE TRIGGER IF NOT EXISTS stocktake_{table}_no_{action.lower()} BEFORE {action} ON {table} BEGIN SELECT RAISE(ABORT, 'stocktake evidence is immutable'); END")
        op.execute("""CREATE TRIGGER IF NOT EXISTS stocktake_frozen_occurrence
            BEFORE UPDATE OF remaining_quantity, management_category ON defect_quarantine_records
            WHEN EXISTS (SELECT 1 FROM stocktake_control WHERE id=1 AND inventory_mode='POOL')
            AND (NEW.remaining_quantity <> OLD.remaining_quantity OR NEW.management_category <> OLD.management_category)
            BEGIN SELECT RAISE(ABORT, 'POOL occurrence balances and categories are historical'); END""")
    else:
        op.execute("""CREATE OR REPLACE FUNCTION stocktake_immutable_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'stocktake evidence is immutable'; END; $$""")
        for table in IMMUTABLE_TABLES:
            op.execute(f"DROP TRIGGER IF EXISTS stocktake_immutable ON {table}")
            op.execute(f"CREATE TRIGGER stocktake_immutable BEFORE UPDATE OR DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION stocktake_immutable_evidence()")
        op.execute("""CREATE OR REPLACE FUNCTION stocktake_frozen_occurrence() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                IF EXISTS (SELECT 1 FROM stocktake_control WHERE id=1 AND inventory_mode='POOL')
                    AND (NEW.remaining_quantity <> OLD.remaining_quantity OR NEW.management_category <> OLD.management_category)
                THEN RAISE EXCEPTION 'POOL occurrence balances and categories are historical'; END IF;
                RETURN NEW;
            END; $$""")
        op.execute("DROP TRIGGER IF EXISTS stocktake_frozen_occurrence ON defect_quarantine_records")
        op.execute("CREATE TRIGGER stocktake_frozen_occurrence BEFORE UPDATE ON defect_quarantine_records FOR EACH ROW EXECUTE FUNCTION stocktake_frozen_occurrence()")


def downgrade() -> None:
    """A database with POOL history requires restoring a verified whole snapshot."""
    raise RuntimeError("Restore a verified snapshot; POOL evidence cannot be downgraded")
