# test_handover.py

## 이 파일은 뭐예요?
인수인계서 작성·인수확인·재고이동·권한을 검증하는 통합 테스트. 수량 부족 시 422, PIN 오류 시 403, 받는 부서 소속원만 인수 가능한 정책, 임시저장(draft) 흐름을 커버.

## 언제 보나요?
- 인수인계 수신 권한 정책 변경 시 (받는 부서 소속 vs 결재권자)
- 재고 이동(TRANSFER_DEPT 로그) 흐름 변경 시
- `HandoverDoc` 상태 기계(draft → submitted → received) 수정 시
- 알림 수신자(받는 부서 소속에게만) 로직 변경 시

## 중요한 내용
- `test_handover_create_and_receive_moves_stock`: 제출 → 인수 확인 → 튜브 -3, 고압 +3, `TRANSFER_DEPT` 로그 1건
- `test_handover_receive_by_receiving_dept_member`: 결재권 없어도 받는 부서 일반 직원은 인수 가능 (2026-06-16 정책)
- `test_handover_receive_by_other_dept_approver_403`: 다른 부서 결재권자는 인수 불가 403
- `test_handover_draft_save_resume_submit`: draft → 이어쓰기(handover_id 전달) → submit 흐름
- `test_handover_create_notifies_receiving_dept`: 제출 시 받는 부서 소속에게만 `HANDOVER_ARRIVED` 알림

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/routers/handover.py]] — 인수인계 라우터
- [[ERP/backend/app/models/📁_models]] — `HandoverDoc`, `HandoverStatusEnum`
- [[ERP/backend/app/services/dept_hierarchy.py]] — 인수 권한 판단 로직
