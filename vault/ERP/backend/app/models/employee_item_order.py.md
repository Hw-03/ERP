# employee_item_order.py

## 이 파일은 뭐예요?
직원별 품목 표시 순서를 저장하는 `EmployeeItemOrder` SQLAlchemy 모델입니다. 직원(`employee_id`)과 품목(`item_id`)의 복합 기본키로 각 직원이 설정한 품목 정렬 순서(`display_order`)를 보관합니다.

## 언제 보나요?
- 직원별 품목 커스텀 순서 기능(GET/PUT/DELETE `/my-order`)을 수정하거나 디버깅할 때
- `employee_item_orders` 테이블 스키마를 확인할 때

## 중요한 내용
- `EmployeeItemOrder` — 유일한 export. `employee_id` + `item_id` 복합 PK
- `display_order` — 정수형, NULL 불가. 값이 작을수록 앞에 표시
- `ondelete="CASCADE"` — 직원 또는 품목 삭제 시 해당 순서 행도 자동 삭제
- `ix_employee_item_orders_employee` 인덱스 — 직원 기준 빠른 조회용

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/models/base.py]] — `Base`, `UUIDString` 타입 정의
- [[ERP/backend/app/models/employee.py]] — `employees` 테이블(FK 대상)
- [[ERP/backend/app/models/item.py]] — `items` 테이블(FK 대상)
