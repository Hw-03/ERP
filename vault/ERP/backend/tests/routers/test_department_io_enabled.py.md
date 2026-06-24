# test_department_io_enabled.py

## 이 파일은 뭐예요?
`Department.io_enabled` 필드의 CRUD 및 마이그레이션 백필 동작을 검증하는 단위 테스트(W11-A). 생산 6개 부서(PROD_DEPTS)는 백필 후에도 `io_enabled=True`를 유지하고, 나머지 부서는 `False`로 전환되는지 확인한다.

## 언제 보나요?
- 부서별 입출고 활성화 로직(`io_enabled`)을 변경하거나 마이그레이션 SQL을 수정할 때
- `POST /api/departments` 또는 `PUT /api/departments/{id}` 응답 스펙을 변경할 때

## 중요한 내용
- `PROD_DEPTS = {"튜브", "고압", "진공", "튜닝", "조립", "출하"}` — 프론트 하드코드 값과 일치해야 함
- 신규 부서 생성 시 `io_enabled` 기본값은 `True`
- 백필 SQL: `PROD_DEPTS` 외 부서만 `io_enabled=0`으로 업데이트
- PUT 응답과 GET 목록 응답 모두 `io_enabled` 필드를 포함해야 함

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/routers/departments.py]] — POST/PUT 부서 엔드포인트
- [[ERP/backend/app/models/📁_models]] — Department 모델, `io_enabled` 컬럼
- [[ERP/backend/bootstrap/migrate.py]] — io_enabled 백필 SQL(`_MIGRATION_DDL`)
