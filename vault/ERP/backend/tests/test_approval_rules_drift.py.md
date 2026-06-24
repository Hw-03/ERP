# test_approval_rules_drift.py

## 이 파일은 뭐예요?
프론트엔드 `ioWorkType.ts`와 백엔드 `app.services.approval_rules`의 결재 규칙 집합이 동기화되어 있는지 자동으로 감시하는 drift 가드 테스트. 한쪽만 수정하면 즉시 실패한다.

## 검증하는 것
- `MANUAL_ORIGINS` (FE) == `MANUAL_LINE_ORIGINS` (BE): 낱개 라인 origin 목록 일치
- `requiresApproval` sub_type 목록 (FE) == `WAREHOUSE_APPROVAL_SUB_TYPES` (BE): 창고 결재 필요 sub_type 일치

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/services/approval_rules.py]] — 테스트 대상 (BE 단일 원천)
- [[ERP/frontend/app/mes/_components/_warehouse_v2/ioWorkType.ts]] — 동기화 대상 (FE)
