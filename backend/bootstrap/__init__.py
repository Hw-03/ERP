"""bootstrap — DB 부트스트랩 책임 분리 패키지.

스키마 변경은 `bootstrap.schema.ensure_schema`의 Alembic 단일 경로로만 수행한다.
`bootstrap.migrate`는 과거 진단 상수와 코드 이력의 import 호환만 유지한다.
참조 데이터 시드와 mes_code 호환 no-op은 스키마 처리 뒤 별도 실행한다.

`backend/bootstrap_db.py` 는 얇은 CLI wrapper 로 남아 기존 명령
(`python bootstrap_db.py --all` 등)을 그대로 지원한다. 외부 호출자
과거 호출자가 사용하던 공개 함수 이름은 Alembic 경로로 연결한다.
"""
from __future__ import annotations

from .init import run_schema_create_all
from .migrate import (
    _BENIGN_MIGRATION_PATTERNS,
    _MIGRATION_DDL,
    _is_benign_migration_skip,
)
from .schema import (
    SchemaBootstrapError,
    SchemaCheckResult,
    SchemaEnsureResult,
    check_schema,
    ensure_schema,
    readonly_connection,
)
from .seed import (
    backfill_mes_codes,
    check_db,
    seed_reference_data,
)


def run_migrations() -> SchemaEnsureResult:
    """기존 공개 이름을 유지하면서 Alembic 단일 경로를 사용한다."""
    return ensure_schema()


def bootstrap_all() -> dict:
    """스키마를 한 번 보장한 뒤 시드와 호환 no-op을 실행한다."""
    schema = ensure_schema()
    seeded = seed_reference_data()
    backfilled = backfill_mes_codes()
    return {
        "schema": schema,
        "seeded": seeded,
        "mes_code_backfilled": backfilled,
    }


__all__ = [
    "bootstrap_all",
    "ensure_schema",
    "check_schema",
    "readonly_connection",
    "run_schema_create_all",
    "run_migrations",
    "SchemaBootstrapError",
    "SchemaCheckResult",
    "SchemaEnsureResult",
    "seed_reference_data",
    "backfill_mes_codes",
    "check_db",
    # 하위호환 — bootstrap_db 모듈 속성으로도 노출되는 내부 심볼.
    "_MIGRATION_DDL",
    "_BENIGN_MIGRATION_PATTERNS",
    "_is_benign_migration_skip",
]
