# test_notifications.py

## 이 파일은 뭐예요?
결재 알림 시스템을 통합/단위 테스트로 검증. 요청 도착 시 승인 담당자에게만, 승인·반려 시 요청자에게만 알림이 가는지, 읽음 처리가 본인 알림만 영향을 주는지 확인한다.

## 검증하는 것
- 수신자 계산(단위): 창고 결재 → `warehouse_role=primary/deputy`만 / 부서 결재 → `can_approve_department` 룰 따름
- 창고→부서 요청 제출 → 창고 결재자들에게 알림, 요청자 본인 제외
- 승인 완료 → 요청자에게 `approval_approved` 알림
- 반려 → 요청자에게 `approval_rejected` 알림
- mark-read → 본인 알림만 읽음 처리, 타인 미변경
- 요청 트랜잭션 실패(재고 부족) → 알림도 함께 롤백(유령 알림 없음)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/services/notifications.py]] — `recipients_for_warehouse_approval`, `recipients_for_department_approval` (테스트 대상)
- [[ERP/backend/app/routers/notifications.py]] — 알림 라우터
- [[ERP/backend/app/routers/stock_requests.py]] — 승인/반려 엔드포인트
