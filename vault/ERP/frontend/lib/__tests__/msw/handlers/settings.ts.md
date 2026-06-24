# settings.ts

## 이 파일은 뭐예요?
MSW 테스트용 시스템 설정 API 핸들러로, PIN 검증·변경·DB 초기화와 감사 CSV 파일 목록·백필 엔드포인트를 가짜 응답으로 제공합니다.

## 언제 보나요?
- 설정 화면의 PIN 변경·DB 초기화 기능을 테스트할 때
- 감사 CSV 파일 목록 조회 또는 백필 기능을 포함한 설정 페이지를 테스트할 때

## 중요한 내용
- `settingsHandlers` — export되는 핸들러 배열
- 샘플 감사 파일: `2026-04`(50행), `2026-05`(120행) 2건
- `POST /verify-pin` — `"0000"` → 200 OK, 그 외 → 403
- `PUT /admin-pin` — `current_pin !== "0000"` → 403 `"현재 PIN 불일치"`
- `POST /settings/reset` — PIN `"0000"` 필수, DB 초기화 완료 메시지 반환
- `admin.ts`와 `/api/admin/audit-csv/*` 경로가 중복됨(setup에서 어느 핸들러를 사용하는지 확인 필요)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/__tests__/msw/handlers/admin.ts]] — audit-csv 핸들러가 중복 정의된 파일
