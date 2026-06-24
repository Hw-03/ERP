# test_employee_item_order.py

## 이 파일은 뭐예요?
직원별 품목 표시 순서 커스터마이징 API(`/api/items/my-order` GET/PUT/DELETE)의 통합 테스트. 저장·덮어쓰기·직원 격리·존재하지 않는 품목/직원 처리를 검증.

## 언제 보나요?
- `employee_item_orders` 테이블 또는 `/api/items/my-order` 라우터 수정 시
- 품목 순서 저장이 다른 직원에게 영향을 주는지 격리 검증이 필요할 때
- 삭제 후 빈 배열 반환, PUT 멱등성 확인 필요 시

## 중요한 내용
- `test_put_then_get_returns_ordered`: PUT → GET 시 `display_order` 오름차순 정렬 반환 확인
- `test_put_overwrite`: 2차 PUT으로 순서 역전 후 최신 값이 반영되는지 확인
- `test_put_skips_nonexistent_item`: 존재하지 않는 `item_id` 포함해도 200 (ghost는 저장 안 됨)
- `test_nonexistent_employee_*`: 없는 직원 ID로 GET/PUT/DELETE 시 404 반환

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/routers/items.py]] — `/api/items/my-order` 라우터
- [[ERP/backend/app/models/📁_models]] — `EmployeeItemOrder` 모델
