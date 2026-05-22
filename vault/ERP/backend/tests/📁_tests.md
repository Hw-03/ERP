---
type: index
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/tests/
tags: [vault, index, folder-marker]
aliases:
  - "tests"
  - "tests.md"
---

# 📁 tests

> [!summary] 역할
> pytest 기반 백엔드 테스트 전체. 라우터 스모크·통합, 서비스 단위, 동시성(낙관적 락) 세 축으로 구성된 38개 파일.

> [!info] 코드 미러 영역
> 이 폴더는 `erp/backend/tests/` 의 vault 미러. 자식 파일들의 분석 노트가 모여 있다.

## 어떤 파일들이 있나

루트 레벨:
- `[[erp/backend/tests/conftest.py|conftest.py]]` — 전체 공용 픽스처 (인메모리 SQLite DB, TestClient, 시드 데이터)
- `test_stock_requests.py` — 불출 요청 전 흐름 통합 테스트
- `test_io_v2.py` — 입출고 v2 API 통합 테스트
- `test_get_db_rollback.py` — DB 세션 롤백 격리 검증
- `test_migration_diagnostics.py` — 스키마 마이그레이션 진단

`routers/` 서브폴더 (13개):
- `test_health_smoke.py`, `test_bom_smoke.py`, `test_inventory_smoke.py` — 앱 기동·기본 응답 검증
- `test_transactions_summary.py`, `test_transaction_edit.py` — 재고 이력 API
- `test_admin_audit.py`, `test_admin_audit_csv.py` — 감사 로그
- `test_items_update.py`, `test_employee_pin.py`, `test_pin_hardening.py`
- `test_settings_integrity.py`, `test_capacity.py`, `test_weekly_report.py`, `test_dept_adjustment.py`

`services/` 서브폴더 (5개):
- `test_stock_math.py`, `test_bom.py`, `test_integrity.py`, `test_audit_csv.py`, `test_dept_adjustment.py`

`concurrency/` 서브폴더 (15개):
- `conftest.py` — 동시성 픽스처 (ThreadPoolExecutor, 공용 DB)
- 낙관적 락 시나리오: `test_approve_concurrent`, `test_approve_reject_conflict`, `test_cancel_approve_conflict`, `test_transfer_concurrent`, `test_transfer_concurrent_atomic`, `test_reserve_concurrent` 등
- 불변식 검증: `test_inventory_invariant`

## 도메인 컨텍스트

`verify_local.ps1` 이 커밋 전 자동으로 이 전체 스위트를 실행한다. 동시성 테스트는 실제 스레드를 병렬 실행해 낙관적 락 충돌을 재현하므로, 재고 상태 전이 코드 변경 시 반드시 통과 확인.

## ⚠️ 위험 포인트

- `conftest.py` 의 픽스처 스코프(function/session) 변경 시 테스트 간 상태 오염 가능.
- `concurrency/` 테스트는 타이밍에 민감 — CI 느린 환경에서 flaky 가능성 있음.
- 샘플 데이터와 실운영 데이터를 혼용하지 말 것 (CLAUDE.md 규칙).

## 관련 가이드

- [[erp/_vault/guides/run-backend|run-backend]]
- [[erp/_vault/guides/verify-local|verify-local]]

## 자식 폴더

- [[erp/backend/tests/routers/📁_routers|routers/]] — 라우터 통합·스모크 테스트 13개
- [[erp/backend/tests/services/📁_services|services/]] — 서비스 단위 테스트 5개
- [[erp/backend/tests/concurrency/📁_concurrency|concurrency/]] — 동시성·낙관적 락 테스트 15개
