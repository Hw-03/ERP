"""Join current main and census schema histories without rewriting either branch."""

revision = "20261014_0045"
down_revision = ("20261008_0041", "20261006_0044")
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Both parent branches already contain the complete schema changes."""


def downgrade() -> None:
    """The merge itself adds no schema objects."""
