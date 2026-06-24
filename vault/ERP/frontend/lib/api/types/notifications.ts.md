# notifications.ts

## 이 파일은 뭐예요?
결재 알림 도메인의 TypeScript 타입 정의 파일입니다. 브라우저 전역 `Notification`과 이름 충돌을 피하기 위해 `AppNotification`이라는 이름을 사용합니다.

## 언제 보나요?
- 알림 목록 조회/읽음 처리 기능을 수정할 때
- 알림 타입(`approval_request` / `approval_approved` / `approval_rejected`)이나 응답 구조를 확인해야 할 때

## 중요한 내용
- `NotificationType` — 알림 종류 3가지: 결재 요청·승인·반려
- `AppNotification` — 개별 알림 항목. `target_tab`, `target_section`으로 클릭 시 이동 위치를 지정, `related_request_id`로 관련 결재 요청 연결
- `NotificationListResponse` — 알림 목록 + `unread_count`(읽지 않은 수)
- `NotificationMarkReadPayload` — 읽음 처리 요청 본문. `notification_ids` 없으면 전체 읽음 처리

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/types/index.ts]] — 이 타입을 포함해 전체 타입을 re-export하는 barrel
- [[ERP/backend/app/routers/notifications.py]] — 알림 조회/읽음 처리 백엔드 API
