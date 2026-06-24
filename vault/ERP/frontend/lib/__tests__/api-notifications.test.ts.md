# api-notifications.test.ts

## 이 파일은 뭐예요?
`notificationsApi`의 두 함수(`listNotifications`, `markNotificationsRead`)가 올바른 URL과 페이로드로 `fetch`를 호출하는지 검증하는 단위 테스트입니다. MSW 대신 `vi.fn()`으로 `globalThis.fetch`를 직접 스파이 처리합니다.

## 언제 보나요?
- `frontend/lib/api/notifications.ts`의 API 함수를 수정할 때
- 알림 목록 조회나 읽음 처리 엔드포인트가 변경될 때

## 중요한 내용
- `notificationsApi.listNotifications("e-1")` — URL에 `/api/notifications`와 `recipient_employee_id=e-1` 포함 여부 검증
- `notificationsApi.markNotificationsRead(...)` — URL에 `/api/notifications/mark-read` 포함, method `POST`, body의 `recipient_employee_id`·`notification_ids` 검증
- `afterEach`로 `globalThis.fetch` 원복(다른 테스트 오염 방지)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/notifications]] — 테스트 대상 API 함수 구현체
