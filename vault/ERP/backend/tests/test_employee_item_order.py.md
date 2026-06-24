# test_employee_item_order.py

## 이 파일은 뭐예요?
직원별 품목 표시 순서 커스터마이징 API(GET/PUT/DELETE `/api/items/my-order`)를 검증하는 통합 테스트. 저장·덮어쓰기·삭제·에러 처리를 전부 커버한다.

## 검증하는 것
- 행 없을 때 GET → 빈 배열 반환
- PUT 후 GET → `display_order` 오름차순 반환
- 두 번째 PUT → 이전 순서를 완전히 덮어씀
- 존재하지 않는 `item_id` 포함 PUT → 해당 행 skip, 200 반환
- DELETE 후 GET → 빈 배열
- 존재하지 않는 `employee_id` → GET/PUT/DELETE 모두 404

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/routers/items.py]] — `/api/items/my-order` 라우터 (테스트 대상)
- [[ERP/backend/app/models/📁_models]] — `EmployeeItemOrder` 모델
