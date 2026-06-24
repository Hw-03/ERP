# query.py

## 이 파일은 뭐예요?
창고 지도 조회 전용 라우터. 인증 없이 누구나 호출할 수 있는 GET 엔드포인트 5개(`/box-tracking`, `/structure`, `/map`, `/reconcile`, `/jari`)를 정의한다.

## 언제 보나요?
- 프론트엔드가 창고 지도 화면을 렌더할 때 호출하는 API를 파악할 때
- 박스 자동 차감 활성 여부(`/box-tracking`) 동작을 확인할 때
- 배치 수량 vs 창고 재고 불일치 경고(`/reconcile`) 로직을 추적할 때

## 중요한 내용
- `GET /box-tracking` — `is_box_tracking_enabled(db)` 결과 반환, 프론트가 편집/경고 UI 노출 결정에 사용
- `GET /structure` — `WarehouseAngle` 전체를 `display_order`, `id` 순 정렬해 반환
- `GET /map` — `wm_service.build_map_payload(db)` 호출, 구조+박스+품목/부서색 통합 페이로드 반환
- `GET /reconcile` — `item_id` 쿼리 파라미터(선택)로 특정 품목만 필터 가능; `wm_service.reconcile_inventory` 위임
- `GET /jari` — `angle_id`, `row`, `layer`, `jari` 4개 필수 쿼리 파라미터로 특정 자리 박스 스택 반환

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/services/warehouse_map.py]] — `build_map_payload`, `reconcile_inventory`, `is_box_tracking_enabled` 실제 로직
- [[ERP/backend/app/schemas/📁_schemas]] — `WarehouseMapResponse`, `ReconcileResponse`, `BoxTrackingResponse` 등 응답 스키마
- [[ERP/backend/app/routers/warehouse_map/__init__.py]] — 이 라우터를 포함하는 패키지 진입점
