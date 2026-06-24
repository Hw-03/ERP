# useSettingsQuery.ts

## 이 파일은 뭐예요?
설정 화면 전용 관리자 PIN 검증·변경·DB 초기화·감사 CSV 목록 조회·백필 트리거를 제공하는 React Query 훅 모음입니다. `adminApi`를 사용하며 `useAdminQuery.ts`와 같은 API를 쓰지만 설정 화면 게이트용으로 분리된 파일입니다.

## 언제 보나요?
- 설정 화면에서 PIN 입력 또는 DB 초기화 흐름을 추적할 때
- `useAdminQuery.ts`와의 차이(어느 쪽을 써야 하는지)를 확인할 때

## 중요한 내용
- `useAuditCsvListQuery` — `queryKeys.settings.auditCsvList()` 키 사용
- `useVerifyPinMutation` — PIN 검증, 캐시 invalidate 없음
- `useUpdatePinMutation` — `{ current_pin, new_pin }` 구조
- `useResetDatabaseMutation` — DB 초기화, 캐시 invalidate 없음
- `useTriggerAuditBackfillMutation` — 성공 시 `queryKeys.settings.all` invalidate

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/admin]] — 실제 API 호출 함수
- [[ERP/frontend/lib/queries/useAdminQuery.ts]] — admin 게이트 전용 훅 (같은 API, 다른 목적)
- [[ERP/frontend/lib/queries/keys.ts]] — 쿼리 키 정의
