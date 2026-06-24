# notifications.ts

## 이 파일은 뭐예요?
결재 알림 API 모듈입니다. 직원별 알림 목록 조회, 읽지 않은 알림 수 조회, 읽음 처리 3개 메소드를 제공합니다.

## 언제 보나요?
- 알림 뱃지(미읽은 카운트)나 알림 목록 화면을 개발할 때
- 알림 읽음 처리 흐름을 추적할 때

## 중요한 내용
- `notificationsApi.listNotifications(employeeId)` — `NotificationListResponse`
- `notificationsApi.unreadNotificationCount(employeeId)` — `{ count: number }`
- `notificationsApi.markNotificationsRead(payload)` — `/api/notifications/mark-read`
- 타입: `NotificationListResponse`, `NotificationMarkReadPayload` → `./types`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/types/notifications.ts]] — 알림 타입
- [[ERP/backend/app/routers/notifications.py]] — 백엔드 알림 라우터
