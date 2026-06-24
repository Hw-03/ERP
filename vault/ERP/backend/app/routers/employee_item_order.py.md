# employee_item_order.py

## 이 파일은 뭐예요?

직원별 품목 표시 순서를 커스터마이징하는 API입니다. 각 직원이 재고 화면에서 보는 품목 순서를 개인화할 수 있습니다.

## 엔드포인트

| 메서드 | 경로 | 역할 |
|--------|------|------|
| GET | `/api/items/my-order?employee_id=<str>` | 직원 품목 순서 조회 |
| PUT | `/api/items/my-order` | 직원 품목 순서 저장 |
| DELETE | `/api/items/my-order?employee_id=<str>` | 직원 품목 순서 초기화 |

## 언제 보나요?

- 재고 화면에서 품목 정렬이 저장되지 않을 때
- 직원별 순서 커스터마이징 기능을 수정할 때

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/backend/app/models/employee_item_order.py.md]] — EmployeeItemOrder 모델
- [[ERP/frontend/lib/queries/useMyItemOrderQuery.ts.md]] — React Query 훅
