"""검색 설정과 통합 검증의 독립 이력을 업무 자료 변경 없이 연결한다."""

revision = "20261015_0047"
down_revision = ("20261014_0046", "20261015_0046")
branch_labels = None
depends_on = None
EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}


def upgrade() -> None:
    """두 부모의 스키마를 유지하고 Alembic 이력만 하나로 연결한다."""
    pass


def downgrade() -> None:
    """분리된 코드와 DB를 혼용하지 않도록 이전 묶음 복원을 요구한다."""
    raise RuntimeError("Automatic downgrade is not supported; restore the pre-migration database together with its matching code.")
