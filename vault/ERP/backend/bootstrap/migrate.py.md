# migrate.py

## 이 파일은 뭐예요?
DB 스키마 변경 이력을 `_MIGRATION_DDL` 리스트에 누적하고, `run_migrations()`가 각 DDL을 순차 실행하면서 성공·멱등스킵·실패 세 가지로 분류해 반환한다. SQLite의 `ALTER TABLE` 한계를 보완하는 보조 헬퍼 함수들(컬럼 rename·재생성·FK 정리 등)도 포함한다.

## 언제 보나요?
- 새 컬럼이나 테이블을 추가해야 할 때 (`_MIGRATION_DDL` 리스트에 SQL을 추가)
- `bootstrap_db.py --all` 실행 후 "REAL FAILURE" 로그가 찍힐 때 원인 추적
- 운영 DB와 개발 DB 스키마 차이를 좁혀야 할 때
- `tests/test_migration_diagnostics.py`가 `_MIGRATION_DDL`을 monkeypatch할 때 동작 파악

## 중요한 내용
- `run_migrations() -> dict` — 단일 진입점. `_MIGRATION_DDL` 전체 실행 후 보조 헬퍼 10여 개를 순서대로 호출. 반환: `{applied, skipped, failed, errors}`
- `_MIGRATION_DDL: list[str]` — 누적 ALTER TABLE / CREATE TABLE / DROP TABLE / 백필 UPDATE 314줄. 테스트가 monkeypatch하는 **모듈 글로벌 심볼**이므로 변수명 변경 금지.
- `_BENIGN_MIGRATION_PATTERNS: tuple[str, ...]` — "duplicate column name", "already exists", "no such column" 등 멱등 스킵 판정 패턴.
- `_is_benign_migration_skip(exc) -> bool` — 예외가 멱등 스킵인지 실패인지 판정.
- 보조 헬퍼 목록 (모두 멱등):
  - `_consolidate_item_code_columns()` — `erp_code → item_code` rename
  - `_rename_item_code_to_mes_code()` — `item_code → mes_code` rename + snapshot 컬럼
  - `_drop_unused_item_columns()` — spec/barcode/legacy_file_type 제거
  - `_drop_dead_m1_objects()` — variance_logs / process_flow_rules / items.symbol_slot 제거
  - `_unify_quantity_columns_to_integer()` — 수량 컬럼 타입 INTEGER 통일
  - `_recreate_items_with_generated_mes_code()` — mes_code를 STORED 생성열로 전환
  - `_make_mes_code_global_unique()` — ix_items_mes_code를 전체 unique로 복원
  - `_drop_dead_transaction_type_enum_values()` — PG only enum 정리
  - `_cleanup_production_hierarchy()` — 폐기된 부서 계층 데이터 정리

## 위험도
🔴 높음 — 운영 DB 스키마를 직접 변경하는 마이그레이션 로직. `_MIGRATION_DDL`에 DDL을 추가할 때 반드시 멱등 여부 확인 필요. 보조 헬퍼들은 `PRAGMA foreign_keys=OFF` + raw connection으로 테이블 재생성을 수행하므로 실패 시 롤백이 필요하다.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/database.py]] — `engine` 정의 (모듈 글로벌로 유지 필수)
- [[ERP/backend/bootstrap/__init__.py]] — `run_migrations`, `_MIGRATION_DDL`, `_BENIGN_MIGRATION_PATTERNS`, `_is_benign_migration_skip` re-export
- [[ERP/backend/tests/test_migration_diagnostics.py]] — `_MIGRATION_DDL`과 `engine`을 monkeypatch하는 테스트
