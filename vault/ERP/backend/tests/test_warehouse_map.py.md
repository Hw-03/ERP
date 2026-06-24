# test_warehouse_map.py

## 이 파일은 뭐예요?
창고 지도 API(`routers/warehouse_map/` + `services/warehouse_map.py`)를 통합 테스트로 검증. 앵글·박스 CRUD, 좌표/용량 유효성, 지도 조회, 재고 대조, 박스 이동(드래그) 전 범위를 커버한다.

## 검증하는 것
- 앵글 생성(정상, 자격증명 없음→403, warehouse_role=none→403, 잘못된 PIN→403)
- 앵글 목록(`/structure`) 순서 확인
- 앵글 삭제 시 박스 있으면 409 차단
- 박스 좌표 범위 초과 → 422
- 자리(jari) 용량 초과(LARGE 이후 SMALL 추가) → 422
- 존재하지 않는 품목 포함 박스 생성 → 404
- 박스 내용물 교체(PUT) → 품목 변경 확인
- 박스 삭제 → 지도에서 사라짐
- `/map` 응답에 앵글·박스·품목명·수량·부서 포함
- `/reconcile` 재고 대조: 박스 합계 < 창고 재고 → `status=under`, `diff=-N`
- `/reconcile` 일치 시 `status=ok`
- `/jari` 특정 자리 스택 조회
- 박스 이동(PATCH `/boxes/{id}/move`) → 좌표 변경 확인
- 이동 시 목적지 용량 초과 → 422
- 이동 권한 없음(자격증명 없음) → 403
- 같은 자리 내 이동 → 맨 위(stack_order 최대)로
- 스택 전체 재배치(`/boxes/restack`) → 지정 순서로 재정렬
- restack 권한 없음 → 403

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/routers/warehouse_map/📁_warehouse_map]] — 테스트 대상 라우터 디렉터리
- [[ERP/backend/app/services/warehouse_map.py]] — 서비스 레이어
