---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/BACKEND_REFACTOR_PLAN.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# BACKEND_REFACTOR_PLAN.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/BACKEND_REFACTOR_PLAN.md]]

## 원본 첫 줄 (또는 메타)

```
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
| **`/api/production/capacity` 계산식 정합** | ✅ — `inv.quantity - pending` (부서/불량 포함) → `StockFigures.warehouse_available` (= warehouse - pending). production_receipt 의 실제 차감 검사식과 일치. 부서 생산재고/불량재고가 immediate 에 섞여 부풀려지던 문제 해소. |
| **`/capacity` N+1 제거** | ✅ — `build_bom_cache()` 1쿼리 + `bulk_compute()` 1쿼리 + Items IN 1쿼리. 루프 내 단건 쿼리 4종 제거. |
| **`bom.py get_all_bom` N+1 제거** | ✅ — parent/child 단건 쿼리 N×2회 → Items IN 1회. |
| **`services/bom.py explode_bom` 메모리 캐시** | ✅ — `BomCache` 도입. `cache=` 키워드로 호출 간 공유 가능. 단독 호출 시에도 진입점에서 1쿼리만 발사. |
| **WAL 안전 백업** | ✅ — `scripts/ops/backup_db.bat` 가 `sqlite3 .backup` → Python `sqlite3.backup` → WAL checkpoint+3종 복사 폴백 순서로 동작. |

```
