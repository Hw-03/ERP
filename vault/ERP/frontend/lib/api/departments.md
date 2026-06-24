# departments.ts

## 이 파일은 뭐예요?
부서 마스터 데이터 API 모듈입니다. 앱 세션 ID 조회, 부서 목록·생성·수정·삭제·순서 변경 6개 메소드를 제공합니다.

## 언제 보나요?
- 부서 관리 화면(생성·수정·삭제·정렬)을 개발할 때
- 앱 세션 `boot_id`를 조회해 화면 새로고침 감지에 쓸 때

## 중요한 내용
- `departmentsApi.getAppSession()` — `/api/app-session`, `{ boot_id, started_at }` 반환
- `departmentsApi.getDepartments(params?)` — 활성 여부 필터 포함
- `departmentsApi.createDepartment(payload)` — PIN, `color_hex`, `io_enabled` 포함
- `departmentsApi.updateDepartment(id, payload)` — PIN 필수
- `departmentsApi.deleteDepartment(id, pin)`
- `departmentsApi.reorderDepartments(payload)` — PIN 필수
- 타입: `DepartmentMaster` → `./types`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/types/departments.ts]] — DepartmentMaster 타입
- [[ERP/backend/app/routers/departments.py]] — 백엔드 부서 라우터
