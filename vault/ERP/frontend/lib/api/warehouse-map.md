# warehouse-map.ts

## 이 파일은 뭐예요?
창고 지도 API 모듈입니다. 앵글(구획) 구조 CRUD·순서 변경, 박스 생성·수정·이동·재적재·삭제, 재고 대조(reconcile), 자리 단위 조회까지 창고 지도 전체 기능을 다룹니다.

## 언제 보나요?
- 창고 지도 화면(앵글 배치, 박스 관리, 재고 대조 탭)을 개발할 때
- 박스 이동·재적재(restackJari) 로직을 볼 때
- `WarehouseAngle`, `WarehouseBox`, `ReconcileResult` 타입이 필요할 때

## 중요한 내용
- `warehouseMapApi.getMap()` — 전체 지도(`WarehouseMap`: angles + boxes)
- `warehouseMapApi.getStructure()` — 앵글 목록만
- `warehouseMapApi.reconcile(itemId?)` — 배치 수량 vs 창고 재고 대조, `ReconcileResult`
- `warehouseMapApi.getJari(...)` — 특정 자리의 박스 목록
- `createAngle / updateAngle / deleteAngle / reorderAngles` — 앵글 편집
- `createBox / updateBox / moveBox / restackJari / deleteBox` — 박스 편집
- `BoxSize` type — `"LARGE" | "MEDIUM" | "SMALL"`
- `WarehouseAngle`, `WarehouseBox`, `WarehouseBoxItem`, `WarehouseMap`, `ReconcileRow`, `ReconcileResult`, `BoxItemPayload` — 이 파일에서 직접 export

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/routers/warehouse_map/📁_warehouse_map]] — 백엔드 창고 지도 라우터
- [[ERP/frontend/lib/api-core.ts]] — deleteJson, fetcher, patchJson, postJson, putJson
