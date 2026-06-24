# warehouse_manager.py

## 이 파일은 뭐예요?
창고 정/부 관리자(`warehouse_role` = primary 또는 deputy) 권한을 FastAPI `Depends`로 제공하는 인증 의존성입니다. `X-Employee-Code`와 `X-Operator-Pin` 헤더로 사번·PIN을 받아 검증하고, 통과 시 `Employee` 객체를 반환합니다.

## 언제 보나요?
- 창고 지도 편집(박스·앵글 CRUD) 엔드포인트의 인증 흐름을 파악할 때
- 창고 관리자 권한 오류(403)가 발생하는 원인을 추적할 때
- 새로운 창고 편집 라우터에 관리자 인증을 추가할 때

## 중요한 내용
- `require_warehouse_manager(db, x_employee_code, x_operator_pin)` — 헤더에서 사번·PIN 추출 → Employee 조회 → PIN 해시 검증 → warehouse_role 확인 → Employee 반환
- `_MANAGER_ROLES = ("primary", "deputy")` — 허용 역할 상수
- 인증 실패 시 모두 403 반환 (사번 없음 / 비활성 직원 / PIN 불일치 / 역할 부족)
- 반환값이 `Employee`이므로 엔드포인트에서 작업자 정보를 바로 활용 가능

## 위험도
🔴 높음 — 창고 박스·앵글 CRUD의 유일한 인증 게이트. 역할 조건 변경 시 창고 편집 권한 범위 전체에 영향.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/services/pin_auth.py]] — `verify_pin` PIN 해시 검증 구현
- [[ERP/backend/app/models/📁_models]] — `Employee` 모델 및 `warehouse_role` 필드
- [[ERP/backend/app/routers/_errors.py]] — `ErrorCode`, `http_error` 헬퍼
- [[ERP/backend/app/database.py]] — `get_db` 세션 의존성
