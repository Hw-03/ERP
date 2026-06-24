# notifications.ts

## 이 파일은 뭐예요?
결재 알림 도메인의 API 클라이언트입니다. 직원별 알림 목록 조회·미읽음 카운트·일괄 읽음 처리를 담당하며, 백엔드 `/api/notifications` 라우터와 통신합니다.

## 중요한 내용
- `listNotifications(employeeId)` — `GET /api/notifications?recipient_employee_id=...` : 내 알림 목록 전체 조회
- `unreadNotificationCount(employeeId)` — `GET /api/notifications/unread-count?recipient_employee_id=...` : 미읽음 알림 건수
- `markNotificationsRead(payload)` — `POST /api/notifications/mark-read` : 지정 알림 일괄 읽음 처리

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/routers/notifications.py]] — 백엔드 짝 (알림 라우터)
- [[ERP/frontend/lib/api-core.ts]] — fetch 기반 (`fetcher`, `postJson`, `toApiUrl`)
- [[ERP/frontend/lib/api/types/📁_types]] — `NotificationListResponse`, `NotificationMarkReadPayload` 타입 정의
