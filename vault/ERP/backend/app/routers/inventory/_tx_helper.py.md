# _tx_helper.py

## 이 파일은 뭐예요?
직접 입출고 엔드포인트에서 공통으로 사용하는 헬퍼 함수 모음. 현재는 사번(employee_code)으로 직원을 조회해 이름과 employee_id를 반환하는 `resolve_producer` 하나만 있다.

## 언제 보나요?
- 입출고 트랜잭션 라우터(receive, transfer 등)에서 생산자 정보를 직원 DB에서 검증·조회해야 할 때
- `employee_code`가 없거나 비활성 직원일 때 422 처리 흐름을 추적할 때

## 중요한 내용
- `resolve_producer(db, employee_code)` — 사번으로 Employee를 조회해 `(name, employee_id)` 튜플 반환. `employee_code`가 None이면 `(None, None)` 반환(기존 produced_by 동작 유지). 미존재·비활성이면 422 raise.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/models/employee.py]] — Employee 모델 정의
- [[ERP/backend/app/routers/_errors.py]] — `ErrorCode`, `http_error` 공용 에러 헬퍼
- [[ERP/backend/app/routers/inventory/receive.py]] — 이 헬퍼를 사용하는 입고 라우터
