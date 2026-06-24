# io-dept-to-warehouse.spec.ts

## 이 파일은 뭐예요?
부서 → 창고 회수 wizard 전체 흐름을 검증하는 e2e 스펙입니다. 창고 역할로 로그인해 "창고 입출고 → 부서 → 창고"를 선택하고, 조립 부서 생산재고에서 원자재를 낱개 회수 제출하면 "창고 결재 요청 완료" 다이얼로그가 뜨는지 확인합니다.

## 언제 보나요?
- 부서→창고 회수 경로의 결재 종류(`approvalKind="warehouse"`)나 wizard 단계가 변경됐을 때
- globalSetup의 부서 생산재고 시드(조립 부서에 원자재 50개)가 올바른지 확인할 때

## 중요한 내용
- 대상 시나리오: P2-1 / 시나리오 3 (부서 → 창고 회수)
- 검증 포인트: 최종 다이얼로그 "창고 결재 요청 완료"
- 회수 대상: globalSetup이 조립 부서 PRODUCTION 재고에 시드한 E2E원자재튜브 50개

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/tests/e2e/_helpers.ts]] — `loginAsOperator`, `gotoWarehouseCompose`, `pickWorkType`
- [[ERP/frontend/tests/e2e/global-setup.ts]] — 조립 부서 생산재고 시드 주체(`transfer_to_production`)
