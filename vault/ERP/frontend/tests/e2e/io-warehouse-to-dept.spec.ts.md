# io-warehouse-to-dept.spec.ts

## 이 파일은 뭐예요?
창고 → 부서 출고 wizard 전체 흐름을 검증하는 e2e 스펙입니다. 창고 역할로 로그인해 "창고 입출고 → 창고 → 부서"를 선택하고 조립 부서 낱개 출고를 제출하면 "창고 결재 요청 완료" 다이얼로그가 뜨는지 확인합니다.

## 언제 보나요?
- 창고→부서 출고 wizard 단계나 결재 종류(`approvalKind="warehouse"`)가 변경됐을 때
- 창고 결재 요청 완료 다이얼로그 표시 회귀를 확인할 때

## 중요한 내용
- 대상 시나리오: P2-1 / 시나리오 2 (창고 → 부서 결재 요청)
- 검증 포인트: 최종 다이얼로그 "창고 결재 요청 완료"
- 라이브 정책: `warehouse_to_dept`는 `requiresApproval → approvalKind="warehouse"`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/tests/e2e/_helpers.ts]] — `loginAsOperator`, `gotoWarehouseCompose`, `pickWorkType`
- [[ERP/frontend/tests/e2e/io-approval-cycle.spec.ts]] — 이 spec이 만든 요청을 E22가 승인하는 풀사이클 테스트
