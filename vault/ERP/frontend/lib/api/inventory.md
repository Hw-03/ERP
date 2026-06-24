# inventory.ts

## 이 파일은 뭐예요?
창고 재고 직접 조작 API 모듈입니다. 재고 요약 조회부터 입고·조정·이동(창고↔생산부, 부서간)·불량처리·반품·위치 조회까지 9개 메소드를 제공합니다.

## 언제 보나요?
- 창고 재고 화면(수량 현황, 위치별 재고)을 개발하거나 디버깅할 때
- 재고 이동·조정·불량마킹 흐름을 추적할 때
- `inventoryApi` 메소드 시그니처가 필요할 때

## 중요한 내용
- `inventoryApi.getInventorySummary()` — `/api/inventory/summary`
- `inventoryApi.receiveInventory(payload)` — 입고
- `inventoryApi.adjustInventory(payload)` — 수량 조정 (reason 필수)
- `inventoryApi.transferToProduction(payload)` — 창고→생산부 이동
- `inventoryApi.transferToWarehouse(payload)` — 생산부→창고 반납
- `inventoryApi.transferBetweenDepts(payload)` — 부서 간 이동
- `inventoryApi.markDefective(payload)` — 불량 마킹
- `inventoryApi.returnToSupplier(payload)` — 공급처 반품
- `inventoryApi.getItemLocations(itemId)` — 품목별 위치 목록, `InventoryLocationRow[]`
- 타입: `InventorySummary`, `InventoryMutationResponse`, `InventoryLocationRow` → `./types`

## 위험도
🔴 높음 — `transferToProduction`, `adjustInventory`, `markDefective` 등은 재고 수량을 직접 변경하는 뮤테이션. 잘못된 payload 전달 시 재고 수치 오염.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/types/inventory.ts]] — 관련 타입 정의
- [[ERP/backend/app/routers/inventory/📁_inventory]] — 백엔드 재고 라우터
- [[ERP/frontend/lib/api-core.ts]] — fetcher, postJson 구현체
