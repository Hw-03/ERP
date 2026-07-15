"""기존 스키마 초기화 공개 이름을 Alembic 경로에 연결한다."""
from __future__ import annotations

from .schema import SchemaEnsureResult, ensure_schema


def run_schema_create_all() -> SchemaEnsureResult:
    """기존 공개 이름을 유지하면서 Alembic 단일 경로를 사용한다."""
    return ensure_schema()
