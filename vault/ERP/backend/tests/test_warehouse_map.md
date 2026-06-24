# test_warehouse_map.py

## 이 파일은 뭐예요?
창고 지도 API(`/api/warehouse-map`) 전체 통합 테스트. 앵글 CRUD, 박스 좌표/용량 검증, 지도 조회, 재고 대조(reconcile), 박스 드래그 이동, 스택 재배치를 커버. 모든 편집 API는 `warehouse_role=primary/deputy` + PIN 인증 필요.

## 언제 보나요?
- 창고 지도 라우터(`routers/warehouse_map/`) 또는 `services/warehouse_map.py` 수정 시
- 박스 좌표 범위 초과, 자리 용량 초과 검증 로직 변경 시
- reconcile(배치 수량 vs warehouse_qty 불일치) 계산 로직 의심 시
- 박스 드래그 이동 또는 스택 재배치 로직 변경 시

## 중요한 내용
- `_seed_warehouse_manager` fixture: 모든 테스트에 `autouse=True`로 창고장 WM001 시드
- `test_jari_capacity_exceeded`: 대(3) 박스 1개로 자리 꽉 차면 소(1) 추가 422
- `test_reconcile_detects_under`: 배치 7 / warehouse_qty 10 → `diff=-3`, `status="under"`
- `test_move_box_same_jari_brings_to_top`: 같은 자리 이동 → 맨 위 stack_order 배정
- `test_restack_jari_reorders_middle`: 스택 전체 순서 재배치 검증

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/routers/warehouse_map/📁_warehouse_map]] — 앵글/박스/쿼리 라우터
- [[ERP/backend/app/services/warehouse_map.py]] — 서비스 로직
- [[ERP/backend/app/models/📁_models]] — `WarehouseAngle`, `WarehouseBox`, `WarehouseBoxItem`, `BoxSizeEnum`
