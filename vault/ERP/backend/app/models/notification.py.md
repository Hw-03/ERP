---
type: file-explanation
source_path: "backend/app/models/notification.py"
importance: important
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# notification.py — 결재·인수인계 알림 표

## 이 파일은 무엇을 책임지나

직원에게 쌓이는 영속 알림(Notification) 을 정의합니다. 결재 요청이 도착했거나, 승인/반려가 났거나, 인수인계가 도착했을 때 해당 직원 앞으로 알림 한 건이 만들어집니다.

## 업무 흐름에서의 의미

승인 담당자는 "결재 요청 왔다", 요청자는 "승인됐다/반려됐다", 받는 부서는 "인수인계 도착" 을 알림으로 받습니다. 프론트는 30초마다 폴링(주기적 조회)으로 새 알림을 확인합니다. 알림을 누르면 해당 화면(탭/섹션)으로 이동합니다.

## 언제 보면 좋나

- 알림 종류(요청/승인/반려/인수인계 도착)가 무엇인지 확인할 때
- 알림 클릭 시 어디로 이동하는지(target_tab/target_section) 볼 때
- 안 읽은 알림 조회가 어떻게 빠른지(인덱스) 확인할 때

## 중요한 내용

- `NotificationTypeEnum` — `approval_request`(요청 도착→승인 담당자) / `approval_approved`(승인→요청자) / `approval_rejected`(반려→요청자) / `handover_arrived`(인수인계 도착→받는 부서).
- `Notification` — 알림 한 건. `recipient_employee_id`(받는 사람), `type`·`title`·`body`, 이동 위치(`target_tab`/`target_section`), 관련 요청(`related_request_id`), 읽음 여부(`is_read`). (받는 사람 × 안 읽음) 인덱스로 미확인 알림을 빠르게 셉니다.

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/models/stock_request.py]] — 알림이 가리키는 결재 요청.
- [[ERP/backend/app/models/handover.py]] — 인수인계 도착 알림의 출처.
- [[ERP/backend/app/models/employee.py]] — 알림을 받는 직원.

## 조심할 점

`type` 칸은 Enum 객체가 아니라 단순 문자열로 저장합니다(PostgreSQL enum 회피 목적). 값은 `NotificationTypeEnum` 과 맞춰야 하지만 DB 차원의 강제는 없습니다.

## 핵심 발췌

```python
class NotificationTypeEnum(str, enum.Enum):
    APPROVAL_REQUEST = "approval_request"
    APPROVAL_APPROVED = "approval_approved"
    APPROVAL_REJECTED = "approval_rejected"
    HANDOVER_ARRIVED = "handover_arrived"
```
