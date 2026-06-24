---
type: file-explanation
source_path: "backend/app/services/production_capacity.py"
importance: important
layer: backend
graph: file
updated: 2026-06-24
project: DEXCOWIN MES
---

# production_capacity.py — 생산 가능 수량 계산

## 이 파일은 뭐예요?

생산 가능 수량을 두 경로로 계산합니다. 한 응답 안에 구버전(`legacy`) 방식과 신버전(AF 기준) 방식이 공존합니다.

## 언제 보나요?

- 생산 가능 수량 화면의 숫자 계산 방식을 이해할 때
- `ship_ready` / `fast_production` / `total_production` 각 수치가 어떻게 나오는지 볼 때
- 병목 품목이 어떻게 결정되는지 확인할 때

## 중요한 내용

**두 계산 경로 — 현재 병행 운영 중**

| 함수 | 기준 | 반환 필드 | 상태 |
|---|---|---|---|
| `compute_legacy_capacity` | 구 PF 합산 | `immediate` / `maximum` / `top_items` | 보존(Phase3 전까지 유지) |
| `compute_af_capacity` | 신규 AF(조립 완제품) 기준 | `ship_ready` / `fast_production` / `total_production` | **현재 기준** |

**신 3지표 정의 (PF 환산 기준)**

- **ship_ready** (출하 대기): PF 완성 재고. 부품 확인 없이 즉시 출하 가능.
- **fast_production** (빠른 생산): AF 재고 + AF 직계 1단계 부품으로 만들 수 있는 AF 수를 PF로 환산.
- **total_production** (총생산): PF 루트로 BOM 전체 재귀 이론 최대.

모든 수량은 `StockFigures.available`(warehouse + production − pending) 기준. 생산 등록 가능성 검증(backflush, `warehouse_available`)이 아니라 **계획/대응 수량 지표**임.

**legacy 경로는 성급히 제거하지 않음**

`compute_legacy_capacity`는 Phase 3(legacy 제거) 계획이 있으나, 현장 전환 완료 전까지 의도적으로 병행 보존. 함부로 삭제 금지.

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/backend/app/routers/production.py]] — 이 서비스를 호출하는 라우터
- [[ERP/backend/app/services/stock_math.py]] — `StockFigures.available` 계산
- [[ERP/backend/app/services/bom.py]] — BomCache·build_bom_cache 사용

> [!info]- 더 연결된 파일
> - [[ERP/_attic/docs/PRODUCTION_CAPACITY_REDEFINITION.md]] — AF→PF 재정의 배경 설계 문서

## 조심할 점

BOM 재귀 전개 깊이 상한(`_BUILDABLE_MAX_DEPTH = 10`)이 있습니다. 비정상 BOM(사이클 등)이 있으면 이 값을 먼저 확인하세요.
