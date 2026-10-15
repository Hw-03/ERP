"""Join deployed stocktake and closure histories without rewriting existing revisions."""

revision = "20261015_0046"
down_revision = ("20261014_0045", "20261008_0044")
branch_labels = None
depends_on = None
EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}


def upgrade() -> None:
    """Record both existing histories; this merge changes no business rows."""
    pass


def downgrade() -> None:
    """Require the matching code and DB snapshot for a consistent rollback."""
    raise RuntimeError("Restore the pre-migration database backup and matching code; downgrade is unsupported")
