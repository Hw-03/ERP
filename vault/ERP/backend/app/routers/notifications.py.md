# notifications.py

## 이 파일은 뭐예요?
결재 알림 API 라우터. 수신자 기준으로 알림 목록 조회, 미읽음 수 확인, 읽음 처리(개별 또는 전체)를 제공한다.

## 언제 보나요?
- 결재 알림 뱃지(미읽음 수)가 제대로 표시되지 않을 때
- 알림 목록이 갱신되지 않거나 읽음 처리가 안 될 때

## 중요한 내용
- `GET /` — `recipient_employee_id` 쿼리 파라미터로 최신 알림 최대 50건 + 미읽음 수 반환 (`_LIST_LIMIT = 50`)
- `GET /unread-count` — 미읽음 수만 단독 반환 (뱃지 폴링용)
- `POST /mark-read` — `notification_ids` 목록이 없으면 해당 수신자의 미읽음 알림 전체를 읽음 처리
- 내부 헬퍼 `_list_payload` — 목록 조회와 미읽음 수를 한 번에 계산해 응답 구성

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/models/📁_models]] — `Notification` ORM 모델 정의
- [[ERP/backend/app/schemas/📁_schemas]] — `NotificationListResponse`, `NotificationMarkReadRequest` 스키마
- [[ERP/backend/app/services/_tx.py]] — `commit_only` (DB 커밋 유틸)
