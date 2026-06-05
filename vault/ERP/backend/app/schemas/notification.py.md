---
type: file-explanation
source_path: "backend/app/schemas/notification.py"
importance: important
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# notification.py — 알림·인수인계서 API 형식

## 이 파일은 뭐예요?

알림과 인수인계서(튜브→고압/진공) 화면이 서버와 주고받는 데이터 모양을 정의합니다. 결재·인수인계 도착 알림 목록과, 인수인계서 작성·수신 형식이 여기 있습니다.

## 언제 보나요?

- 알림 종(bell) 목록과 안 읽음 개수(`unread_count`)가 어떻게 내려오는지 확인할 때
- 인수인계서 작성·수신(PIN 동반) 요청 형식을 볼 때

## 중요한 내용 (주요 클래스)

- `NotificationResponse`/`NotificationListResponse` — 알림 한 건과 목록(+안 읽음 개수). `target_tab`/`target_section`/`related_request_id` 로 클릭 시 이동 위치를 안내.
- `NotificationMarkReadRequest` — 읽음 처리. `notification_ids` 가 없으면 그 직원 안 읽은 알림 전체를 읽음 처리.
- `HandoverCreate`/`HandoverResponse` — 인수인계서. 공정 내용·제품명·분석 텍스트·첨부 라인(품목·수량)과 수신 정보(`received_by_*`).
- `HandoverReceiveRequest` — 수신 처리(PIN 필요).

## 연결되는 파일

- [[ERP/backend/app/models/notification.py]] — 알림 표.
- [[ERP/backend/app/models/handover.py]] — 인수인계서 표.
- [[ERP/backend/app/schemas/📁_schemas]] — 같은 패키지 형제들.

## 핵심 발췌

```python
class NotificationMarkReadRequest(BaseModel):
    recipient_employee_id: uuid.UUID
    # None 이면 해당 직원의 안 읽은 알림 전체를 읽음 처리.
    notification_ids: Optional[List[uuid.UUID]] = None
```
