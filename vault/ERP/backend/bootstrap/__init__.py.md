# __init__.py

## 이 파일은 뭐예요?
`bootstrap` 패키지의 진입점. 기존 `bootstrap_db.py` 단일 스크립트(865줄)에서 분리된 4단계 부트스트랩 흐름(`create_all → migrate → seed → mes_code 백필`)을 `bootstrap_all()` 한 함수로 묶고, 각 하위 모듈의 공개 심볼을 re-export한다.

## 언제 보나요?
- `bootstrap_db.py --all` 커맨드가 실제로 무엇을 호출하는지 추적할 때
- 테스트에서 `from bootstrap import _MIGRATION_DDL` 등 내부 심볼을 import할 때
- 부트스트랩 단계를 추가하거나 순서를 바꿔야 할 때

## 중요한 내용
- `bootstrap_all() -> dict` — 전체 부트스트랩 4단계를 순서대로 실행. 반환값: `{migrations, seeded, mes_code_backfilled}`
- re-export 목록: `run_schema_create_all`, `run_migrations`, `seed_reference_data`, `backfill_mes_codes`, `check_db`, `_MIGRATION_DDL`, `_BENIGN_MIGRATION_PATTERNS`, `_is_benign_migration_skip`
- `backfill_mes_codes`는 생성열 전환 후 no-op(0 반환)이지만 시그니처는 하위호환 유지

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/bootstrap_db.py]] — 얇은 CLI wrapper; `bootstrap_all` 등을 여기서 import
- [[ERP/backend/bootstrap/init.py]] — 1단계: `create_all`
- [[ERP/backend/bootstrap/migrate.py]] — 2단계: ALTER TABLE 마이그레이션
- [[ERP/backend/bootstrap/seed.py]] — 3단계: 참조 데이터 시드
