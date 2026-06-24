# warehouse-map.ts

## 이 파일은 뭐예요?
창고 지도 도메인의 API 클라이언트입니다. 앵글(구획) CRUD·순서 변경, 박스 CRUD·이동·재스택, 지도 전체 조회, 재고 대조(reconcile)를 담당하며, 백엔드 `/api/warehouse-map` 라우터와 통신합니다.

## 중요한 내용

### 조회
- `getMap()` — `GET /api/warehouse-map/map` : 앵글 + 박스 전체(공개)
- `getStructure()` — `GET /api/warehouse-map/structure` : 앵글 목록만
- `getJari(angleId, row, layer, jari)` — `GET /api/warehouse-map/jari` : 특정 자리의 박스 목록
- `reconcile(itemId?)` — `GET /api/warehouse-map/reconcile` : 배치 수량 ↔ warehouse_qty 대조. `itemId` 생략 시 전체

### 앵글 편집 (창고 관리자)
- `createAngle(payload)` — `POST /api/warehouse-map/angles`
- `updateAngle(id, payload)` — `PUT /api/warehouse-map/angles/{id}`
- `deleteAngle(id)` — `DELETE /api/warehouse-map/angles/{id}`
- `reorderAngles(items)` — `PATCH /api/warehouse-map/angles/reorder` : display_order 일괄 변경

### 박스 편집 (창고 관리자)
- `createBox(payload)` — `POST /api/warehouse-map/boxes`
- `updateBox(boxId, payload)` — `PUT /api/warehouse-map/boxes/{id}` : 크기·품목 수정
- `moveBox(boxId, payload)` — `PATCH /api/warehouse-map/boxes/{id}/move` : 다른 자리로 이동
- `restackJari(payload)` — `PATCH /api/warehouse-map/boxes/restack` : 같은 자리 박스 쌓임 순서 변경 (아래→위)
- `deleteBox(boxId)` — `DELETE /api/warehouse-map/boxes/{id}`

### 주요 타입 (이 파일에서 직접 export)
`BoxSize`, `WarehouseAngle`, `WarehouseBox`, `WarehouseBoxItem`, `WarehouseMap`, `ReconcileRow`, `ReconcileResult`, `BoxItemPayload`

### 권한
- 보기(GET)는 인증 불필요
- 편집(앵글·박스 CUD)은 `warehouse_role` 보유자 — api-core가 `X-Employee-Code` + `X-Operator-Pin` 자동 주입
- box-tracking 토글은 admin PIN 필요

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/routers/warehouse_map/angles.py]] — 앵글 백엔드 짝
- [[ERP/backend/app/routers/warehouse_map/boxes.py]] — 박스 백엔드 짝
- [[ERP/frontend/lib/api-core.ts]] — fetch 기반 (`fetcher`, `postJson`, `putJson`, `patchJson`, `deleteJson`, `toApiUrl`)
