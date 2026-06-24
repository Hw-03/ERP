# warehouse_map.py

## 이 파일은 뭐예요?

창고 지도 데이터를 조립하고 재고와 대조하는 서비스입니다.

- `build_map_payload(db)` — 앵글 구조 + 박스 배치 + 품목 + 부서 색상을 한 번에 조립 (N+1 쿼리 방지)
- `reconcile_inventory(db, ...)` — `Σ(박스 수량)` vs `Inventory.warehouse_qty` 대조

부서 색상: `process_type_code` prefix(T/H/V/N/A/P) → 부서 → `Department.color_hex`.

## 언제 보나요?

- 창고 지도 화면에서 데이터가 누락되거나 색상이 잘못될 때
- 박스 수량과 재고 수량 불일치를 추적할 때

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/backend/app/routers/warehouse_map/query.py.md]] — 조회 API
- [[ERP/backend/app/routers/warehouse_map/angles.py.md]] — 앵글 CRUD
- [[ERP/backend/app/routers/warehouse_map/boxes.py.md]] — 박스 CRUD
- [[ERP/frontend/app/mes/_components/_warehouse_map_sections/📁__warehouse_map_sections.md]] — 지도 UI

> [!info]- 더 연결된 파일
> - [[ERP/backend/app/models/warehouse.py.md]] — WarehouseAngle·WarehouseBox·WarehouseBoxItem
