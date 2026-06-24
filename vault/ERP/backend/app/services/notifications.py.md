# notifications.py

## 이 파일은 뭐예요?
결재 요청 도착·승인·반려 시 알림 수신자를 계산하고 `Notification` 레코드를 DB 세션에 add하는 서비스. commit은 호출 라우터/서비스가 담당하므로 요청 상태 변경과 같은 트랜잭션으로 묶인다.

## 언제 보나요?
- 재고 요청 제출·승인·반려 처리 후 알림이 왜 생성되는지(또는 안 생성되는지) 디버깅할 때
- 알림 수신자(창고 정/부, 부서 결재권자, 인수인계 대상 부서) 계산 로직을 확인할 때
- 알림 본문의 요청 유형 한국어 라벨(`_REQUEST_TYPE_LABEL`)을 수정해야 할 때

## 중요한 내용
- `notify_request_arrived(db, request)` — 결재 대기 요청 도착 시 승인 담당자들에게 알림. 창고 결재 대기면 `warehouse_role` primary/deputy 직원에게, 부서 결재 대기면 `can_approve_department` 통과 직원에게 보냄. 요청자 본인 제외.
- `notify_request_decided(db, request, decision=)` — 승인/반려 결과를 요청자에게 알림. `decision` 값은 `'approved'` 또는 `'rejected'`.
- `notify_handover_arrived(db, doc)` — 인수인계 제출 시 받는 부서(고압/진공) 소속 직원에게만 알림.
- `recipients_for_warehouse_approval` / `recipients_for_department_approval` / `recipients_for_handover` — 수신자 계산 헬퍼(단위 테스트 가능한 순수 함수 형태).
- `_REQUEST_TYPE_LABEL` — `StockRequestTypeEnum` 전 멤버의 한국어 라벨 사전. 프론트 `frontend/lib/io/glossary.ts`의 `REQUEST_TYPE_LABEL`과 미러 관계.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/services/dept_hierarchy.py]] — `can_approve_department` 부서 결재 권한 판정 단일 소스
- [[ERP/backend/app/routers/stock_requests.py]] — 요청 제출·결재 라우터에서 `notify_request_arrived` / `notify_request_decided` 호출
- [[ERP/backend/app/models/📁_models]] — `Notification`, `NotificationTypeEnum`, `StockRequest`, `HandoverDoc` 모델
