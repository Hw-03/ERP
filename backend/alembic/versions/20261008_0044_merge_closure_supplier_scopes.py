"""Join the independently published supplier scope and closure schema histories."""

revision = "20261008_0044"
down_revision = ("20261007_0043", "20261008_0041")
branch_labels = None
depends_on = None
EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}


def upgrade() -> None:
    """Both parent revisions contain the changes; joining them changes no data."""
    pass


def downgrade() -> None:
    """Require paired code/DB restoration rather than reintroducing split heads."""
    raise RuntimeError("Restore the pre-migration database backup and matching code; downgrade is unsupported")
