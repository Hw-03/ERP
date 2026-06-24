# test_employee_io_enabled.py

## 이 파일은 뭐예요?
`Employee.io_enabled` 필드의 CRUD 및 마이그레이션 백필을 검증하는 단위 테스트(W12-#7). 직원별 입출고 권한 토글이 부서 `io_enabled`와 AND 결합되며, 실제 화면 차단은 프론트엔드 `canEnterIO` 가드가 담당함을 전제로 백엔드 라운드트립만 검증한다.

## 언제 보나요?
- 직원 생성/수정(`POST /api/employees`, `PUT /api/employees/{id}`)의 `io_enabled` 처리를 변경할 때
- 마이그레이션 백필 — `employees.io_enabled`를 `departments.io_enabled`로 복사하는 SQL을 검증할 때

## 중요한 내용
- `_emp_payload(**overrides)`: 직원 생성용 기본 payload 헬퍼 함수
- 기본값: `io_enabled=True`, 명시적 `False` 전달 시 `False`로 저장
- 백필 SQL: `employees.io_enabled = departments.io_enabled` (부서명 매칭)
- GET 목록 응답에 `io_enabled` 필드가 `bool` 타입으로 포함되어야 함

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/routers/employees.py]] — POST/PUT 직원 엔드포인트
- [[ERP/backend/app/models/📁_models]] — Employee 모델, `io_enabled` 컬럼
- [[ERP/backend/bootstrap/migrate.py]] — employees 백필 SQL
- [[ERP/backend/tests/routers/test_department_io_enabled.py]] — 부서 io_enabled 대응 테스트
