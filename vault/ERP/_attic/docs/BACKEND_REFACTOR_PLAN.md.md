---
type: file-explanation
source_path: "_attic/docs/BACKEND_REFACTOR_PLAN.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# BACKEND_REFACTOR_PLAN.md — BACKEND_REFACTOR_PLAN.md 설명

## 이 파일은 무엇을 책임지나

`BACKEND_REFACTOR_PLAN.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `백엔드 리팩터링 설계서`
- `진행 상태 (2026-04-26 Phase 5 update)`
- `진행 상태 (2026-04-26 Phase 5.1 정합 fix)`
- `진행 상태 (2026-04-26 Phase 5.2 — 4개 영역 A−)`
- `진행 상태 (2026-04-26 Phase 4 update)`
- `구 설계서 (배경)`
- `1. 라우터 commit/refresh 표준화`
- `현재 상태`
- `비즈니스 로직 호출`
- `트랜잭션 마감 (라우터 책임)`

## 연결되는 파일

- [[ERP/_attic/docs/📁_docs]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# 백엔드 리팩터링 설계서

`feat/erp-overhaul` 브랜치 Phase 3에서 일부 항목 구현 완료. 전반은 여전히 다음 단계 후보로 남는다.

## 진행 상태 (2026-04-26 Phase 5 update)

| Phase 5 항목 | 상태 |
|---|---|
| **모든 라우터 에러 응답 표준화** | ✅ Phase 5 — 12개 라우터의 ~76 HTTPException 을 `http_error` 로 일괄 마이그. settings.py(PIN 라우터)는 보안/인증/권한 제외 규칙 따라 보존. |
| **request_id middleware** | ✅ Phase 5 — X-Request-Id 자동 발급 + 응답 헤더 부착. |
| **OpenAPI 태그·요약 보강** | ✅ Phase 5 — 16개 태그 description 추가. |
| **CORS_EXTRA_ORIGINS env wiring** | ✅ Phase 5 — `main.py` 가 환경 변수 콤마 split 해서 origin 추가. |
| services/inventory.py 분할 (445줄) | ⏸ 보류 — 트랜잭션 로직 위험. Phase 6+ 에서 테스트와 함께. |
| items.py / production.py 분할 | ⏸ 보류 — 비즈니스 로직 복합. 동상. |

## 진행 상태 (2026-04-26 Phase 5.1 정합 fix)

| Phase 5.1 항목 | 상태 |
|---|---|
| **`/api/production/capacity` 계산식 정합** | ✅ — `inv.quantity - pending` (부서/불량 포함) → `StockFigures.warehouse_available` (= warehouse - pending). production_receipt 의 실제 차감 검사식과 일...
| **`/capacity` N+1 제거** | ✅ — `build_bom_cache()` 1쿼리 + `bulk_compute()` 1쿼리 + Items IN 1쿼리. 루프 내 단건 쿼리 4종 제거. |
| **`bom.py get_all_bom` N+1 제거** | ✅ — parent/child 단건 쿼리 N×2회 → Items IN 1회. |
| **`services/bom.py explode_bom` 메모리 캐시** | ✅ — `BomCache` 도입. `cache=` 키워드로 호출 간 공유 가능. 단독 호출 시에도 진입점에서 1쿼리만 발사. |
| **WAL 안전 백업** | ✅ — `scripts/ops/backup_db.bat` 가 `sqlite3 .backup` → Python `sqlite3.backup` → WAL checkpoint+3종 복사 폴백 순서로 동작. |

## 진행 상태 (2026-04-26 Phase 5.2 — 4개 영역 A−)

| Phase 5.2 항목 | 상태 |
|---|---|
| **SQLite 락 정책** | ✅ `database.py` 에 `busy_timeout=5000` + `synchronous=NORMAL` 추가. WAL과 짝, 동시 쓰기 충돌 시 5초 대기 후 재시도. |
| **Inventory CheckConstraint** | ✅ `models.py Inventory.__table_args__` 에 4개 CHECK (`quantity/warehouse_qty/pending_quantity ≥ 0`, `warehouse_qty ≥ pending_quantity`). 사전 위반 0건...
| **`_build_tree` N+1 제거** | ✅ `bom.py:_build_tree_cached` — BomCache 1회 + Items/Inventory IN 1회씩 사전 로드. 트리 깊이 무관 쿼리 수 일정. |
| **관리자 감사로그 (`AdminAuditLog`)** | ✅ 신규 모델 + `services/audit.record()` 헬퍼 + `routers/admin_audit.py` 조회 API. write-path 7곳(items / employees / bom / settings PIN·integrity·reset...
| **startup idempotent create_all** | ✅ `main.py` 가 startup 시 `Base.metadata.create_all(engine)` 호출. 기존 테이블 미변경, 신규 테이블만 자동 생성 (alembic 미도입 환경에서 안전한 마이그레이션). |
| **운영 스크립트 3종** | ✅ `restore_db.bat` (PRE-RESTORE 스냅샷 + integrity_check + wal/shm 제거), `verify_backup.bat` (최신 백업 무결성·행수), `cleanup_backups.bat` (N일 이상 자동 삭제). |
| **OpenAPI 태그 추가** | ✅ "Admin Audit" 태그 description 추가. |

## 진행 상태 (2026-04-26 Phase 4 update)

| 항목 | 상태 | 보류/완료 사유 |
|---|---|---|
| `services/_tx.py` 의 `commit_and_refresh` / `commit_only` | ✅ Phase 3 | inventory 10곳 적용. |
| `services/export_helpers.py` 의 `csv_streaming_response` | ✅ Phase 3 | inventory + items 보일러플레이트 단축. |
| **에러 응답 dict 표준화 (`_errors.py`)** | ✅ **Phase 4** | `routers/_errors.py` + `ErrorCode` 신설. production produ
...
```
