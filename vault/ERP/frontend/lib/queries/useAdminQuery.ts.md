# useAdminQuery.ts

## 이 파일은 뭐예요?
관리자 게이트 진입 전용 React Query 훅 모음입니다. PIN 인증·변경, DB 초기화, 감사 CSV 목록·백필을 `adminApi`로 처리합니다. `useSettingsQuery.ts`와 같은 API를 사용하지만 admin 진입 게이트 화면 전용으로 분리되어 있습니다.

## 언제 보나요?
- admin 화면 게이트(PIN 입력)에서 인증 흐름을 추적할 때
- `useSettingsQuery.ts`와 역할 차이를 확인할 때

## 중요한 내용
- `useAuditCsvFilesQuery` — `queryKeys.admin.auditCsvList()` 키 사용 (settings 키와 구별)
- `useVerifyAdminPinMutation` / `useUpdateAdminPinMutation` / `useResetDatabaseMutation` — 캐시 invalidate 없음
- `useTriggerAuditCsvBackfillMutation` — 성공 시 `queryKeys.admin.all` invalidate

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/admin]] — 실제 API 호출 함수
- [[ERP/frontend/lib/queries/useSettingsQuery.ts]] — 설정 화면용 유사 훅
- [[ERP/frontend/lib/queries/keys.ts]] — 쿼리 키 정의
