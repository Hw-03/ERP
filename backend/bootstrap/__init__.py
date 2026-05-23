"""bootstrap — DB 부트스트랩 책임 분리 패키지.

`bootstrap_db.py` 단일 스크립트(865줄)가 짊어졌던 4단계 책임을 모듈로 분리한다.

- bootstrap.init    — `Base.metadata.create_all` (스키마)
- bootstrap.migrate — 멱등 ALTER TABLE / 보조 마이그레이션 헬퍼
- bootstrap.seed    — 참조 데이터 시드 + item_code 백필 + flow_rules 리셋

`backend/bootstrap_db.py` 는 얇은 CLI wrapper 로 남아 기존 명령
(`python bootstrap_db.py --all` 등)을 그대로 지원한다. 외부 호출자
(`tests/test_migration_diagnostics.py`)가 의존하는 모듈 속성도
`bootstrap_db` 가 re-export 하므로 import 호환 보존.
"""
from __future__ import annotations

from .init import run_schema_create_all
from .migrate import (
    _BENIGN_MIGRATION_PATTERNS,
    _MIGRATION_DDL,
    _is_benign_migration_skip,
    run_migrations,
)
from .seed import (
    backfill_item_codes,
    check_db,
    reset_flow_rules,
    seed_reference_data,
)


def bootstrap_all() -> dict:
    """전체 부트스트랩: create_all → migrate → seed → 품목코드 백필."""
    run_schema_create_all()
    migrations = run_migrations()
    seeded = seed_reference_data()
    backfilled = backfill_item_codes()
    return {
        "migrations": migrations,
        "seeded": seeded,
        "item_code_backfilled": backfilled,
    }


__all__ = [
    "bootstrap_all",
    "run_schema_create_all",
    "run_migrations",
    "seed_reference_data",
    "backfill_item_codes",
    "reset_flow_rules",
    "check_db",
    # 하위호환 — bootstrap_db 모듈 속성으로도 노출되는 내부 심볼.
    "_MIGRATION_DDL",
    "_BENIGN_MIGRATION_PATTERNS",
    "_is_benign_migration_skip",
]
