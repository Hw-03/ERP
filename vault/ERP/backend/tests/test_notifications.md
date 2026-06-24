# test_notifications.py

## 이 파일은 뭐예요?
결재 알림 흐름 통합 테스트. 요청 도착 시 창고/부서 담당자 알림, 승인·반려 시 요청자 알림, 읽음 처리(본인만), 트랜잭션 실패 시 알림 롤백을 검증.

## 언제 보나요?
- 알림 수신자 계산 로직(`can_approve_department`) 변경 시
- 요청 제출/승인/반려 이벤트에서 알림이 누락되거나 잘못된 사람에게 가는 버그 의심 시
- "요청 실패했는데 알림이 남아있다" 유령 알림 버그 발생 시

## 중요한 내용
- `test_warehouse_recipients_are_warehouse_roles`: `warehouse_role=primary/deputy`만 창고 알림 수신
- `test_department_recipients_follow_can_approve_rule`: 창고 부서 대상이면 부서 정/부 제외, 창고 정/부 포함
- `test_warehouse_request_notifies_approvers_excluding_requester`: 요청자 본인에겐 도착 알림 안 감
- `test_mark_read_only_affects_owner`: 읽음 처리는 본인 알림만
- `test_arrived_notification_rolls_back_with_request`: 재고 부족으로 422 → 알림도 함께 롤백

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/services/notifications.py]] — `recipients_for_warehouse_approval`, `recipients_for_department_approval`
- [[ERP/backend/app/services/dept_hierarchy.py]] — `can_approve_department` (수신자 계산 단일 원천)
