"""bootstrap_db.py — DB 부트스트랩 CLI 진입점 (얇은 wrapper).

실제 책임은 `bootstrap/` 패키지로 분리됨:
- `bootstrap.schema` — Alembic 상태 검사·upgrade·안전한 기준선 stamp
- `bootstrap.seed`   — 참조 데이터 시드 + mes_code 호환 no-op

과거 `run_schema_create_all`/`run_migrations` 공개 이름은 호환을 위해 남지만
내부 실행은 모두 `ensure_schema` 한 경로를 사용한다.

FastAPI 앱 시작 시 자동 실행되던 부작용들을 여기로 옮겼다.
`uvicorn app.main:app` 만으로는 DB 가 변하지 않는다. 초기 설치 / 스키마 변경 /
시드 재적용이 필요한 시점에만 명시적으로 실행한다.

Usage:
    cd backend
    python bootstrap_db.py --all                # 스키마 + 마이그레이션 + 시드 + 품목코드 백필
    python bootstrap_db.py --schema --migrate   # DDL 관련만
    python bootstrap_db.py --seed               # 참조 데이터 (Employee/ProductSymbol/…)
    python bootstrap_db.py --mes-code-backfill  # mes_code NULL 품목에 코드 부여
    python bootstrap_db.py --check              # 실행하지 않고 DB 상태만 점검

모듈로도 import 가능:
    from bootstrap_db import bootstrap_all, run_schema_create_all, run_migrations
"""

from __future__ import annotations

import argparse
import sys
import types
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from bootstrap import (
    SchemaBootstrapError,
    bootstrap_all,
    backfill_mes_codes,
    check_schema,
    check_db,
    ensure_schema,
    readonly_connection,
    run_migrations,
    run_schema_create_all,
    seed_reference_data,
)
from bootstrap import migrate as _migrate_mod

# ---------------------------------------------------------------------------
# 하위호환 re-export — 외부 호출자(tests/test_migration_diagnostics.py 등)가
# `bootstrap_db.engine`, `bootstrap_db._MIGRATION_DDL` 모듈 속성으로 접근하므로
# 패키지 측 글로벌을 양방향 동기화하는 모듈 클래스를 단다.
#
# - 읽기: `bootstrap_db.engine` 은 `bootstrap.migrate.engine` 을 가리킨다.
# - 쓰기: `bootstrap_db.engine = X` 는 자동으로 `bootstrap.migrate.engine = X`
#   까지 반영해 monkeypatch 가 패키지 내부 헬퍼에도 적용된다.
# ---------------------------------------------------------------------------
_SYNC_TO_MIGRATE: frozenset[str] = frozenset({"engine", "_MIGRATION_DDL"})


class _BootstrapDbModule(types.ModuleType):
    def __getattr__(self, name: str):  # noqa: D401
        if name in _SYNC_TO_MIGRATE:
            return getattr(_migrate_mod, name)
        raise AttributeError(name)

    def __setattr__(self, name: str, value) -> None:
        super().__setattr__(name, value)
        if name in _SYNC_TO_MIGRATE:
            setattr(_migrate_mod, name, value)


sys.modules[__name__].__class__ = _BootstrapDbModule


# `bootstrap.migrate` 의 내부 헬퍼/상수도 모듈 속성으로 노출 — 기존 ad-hoc 사용 보호.
_BENIGN_MIGRATION_PATTERNS = _migrate_mod._BENIGN_MIGRATION_PATTERNS
_is_benign_migration_skip = _migrate_mod._is_benign_migration_skip


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="MES backend DB bootstrap tool")
    parser.add_argument("--all", action="store_true", help="schema + migrate + seed + 품목코드 백필")
    parser.add_argument("--schema", action="store_true", help="ensure Alembic schema at head")
    parser.add_argument("--migrate", action="store_true", help="upgrade Alembic schema to head")
    parser.add_argument("--seed", action="store_true", help="seed reference data")
    parser.add_argument("--mes-code-backfill", action="store_true", help="backfill mes codes")
    parser.add_argument("--check", action="store_true", help="report DB state without writing")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """CLI 진입점.

    Returns:
        프로세스 종료 코드. 마이그레이션 진짜 실패가 있으면 1
        (start.bat 의 `if errorlevel 1` 가 부트스트랩을 중단하도록).
    """
    args = _parse_args(argv if argv is not None else sys.argv[1:])

    if args.check:
        try:
            with readonly_connection() as connection:
                schema = check_schema(connection=connection)
                print(
                    f"[schema-check] state={schema.state.value} "
                    f"revision={schema.revision or '-'} ready={schema.ready} "
                    f"profile={schema.profile_id or '-'}"
                )
                for difference in schema.differences:
                    print(f"  - {difference}")
                if not schema.ready:
                    return 1
                report = check_db(connection=connection)
        except SchemaBootstrapError as exc:
            print(f"[schema-check] ERROR: {exc}", file=sys.stderr)
            return 1
        print("[check] DB state:")
        for key, val in report.items():
            print(f"  {key}: {val}")
        return 0

    did_something = False
    if args.all or args.schema or args.migrate:
        try:
            result = ensure_schema()
        except SchemaBootstrapError as exc:
            print(f"[schema] ERROR: {exc}", file=sys.stderr)
            return 1
        print(
            f"[schema] state={result.previous_state.value} "
            f"revision={result.revision} changed={result.changed} "
            f"profile={result.profile_id or '-'}"
        )
        if result.backup is not None:
            print(f"[schema] verified_backup={result.backup.path}")
        if result.business_data_unchanged is not None:
            unchanged = str(result.business_data_unchanged).lower()
            print(f"[schema] business_data_unchanged={unchanged}")
        did_something = True
    if args.all or args.seed:
        seeded = seed_reference_data()
        print(f"[seed] {seeded}")
        did_something = True
    if args.all or args.mes_code_backfill:
        count = backfill_mes_codes()
        print(f"[mes-code-backfill] {count} items updated")
        did_something = True

    if not did_something:
        print("Nothing to do. Try: python bootstrap_db.py --all  (or --help)")

    return 0


__all__ = [
    "bootstrap_all",
    "ensure_schema",
    "check_schema",
    "readonly_connection",
    "run_schema_create_all",
    "run_migrations",
    "seed_reference_data",
    "backfill_mes_codes",
    "check_db",
    "main",
]


if __name__ == "__main__":
    sys.exit(main())
