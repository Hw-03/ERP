# test_approval_rules_drift.py

## 이 파일은 뭐예요?
백엔드 `approval_rules.py`(단일 원천)와 프론트엔드 `ioWorkType.ts`의 결재 규칙 집합이 서로 drift(어긋남)가 없는지 자동 탐지하는 CI 가드 테스트. ADR-0005 구현체.

## 언제 보나요?
- `approval_rules.MANUAL_LINE_ORIGINS` 또는 `WAREHOUSE_APPROVAL_SUB_TYPES` 수정 시 이 테스트가 깨진다면 FE도 동시에 갱신해야 함
- `ioWorkType.ts`에서 `MANUAL_ORIGINS` / `requiresApproval` 배열 수정 후 동기화 여부 검증 시
- "FE랑 BE 결재 규칙이 다른 것 같다"는 버그 리포트를 받았을 때

## 중요한 내용
- `test_manual_origins_fe_be_parity`: FE `MANUAL_ORIGINS` == BE `MANUAL_LINE_ORIGINS` 문자열 집합 비교
- `test_warehouse_approval_sub_types_fe_be_parity`: FE `requiresApproval` includes 배열 == BE `WAREHOUSE_APPROVAL_SUB_TYPES` 집합 비교
- 정규식으로 TS 파일 파싱 — FE에서 변수명 리네임 시 `_match()` assert가 먼저 터짐

## 위험도
🔴 높음 — 이 테스트가 통과해도 두 파일 구조가 변경되면 정규식이 silently 잘못된 부분집합을 추출할 수 있음. TS 리팩터 후 반드시 수동 확인 필요.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/services/approval_rules.py]] — `MANUAL_LINE_ORIGINS`, `WAREHOUSE_APPROVAL_SUB_TYPES`
- [[ERP/frontend/app/mes/_components/_warehouse_v2/ioWorkType.ts]] — FE 결재 규칙 (단일 원천 미러)
