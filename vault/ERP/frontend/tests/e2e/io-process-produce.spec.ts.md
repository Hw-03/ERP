# io-process-produce.spec.ts

## 이 파일은 뭐예요?
부서 입출고 중 생산(BOM 자동 전개) wizard를 검증하는 e2e 스펙입니다. 부모 품목(E2E조립튜브)의 "BOM" 버튼 클릭으로 자식(E2E원자재튜브 x2)이 자동 전개되고, 결재 없이 "즉시 반영"으로 완료되는지, 그리고 자식 라인이 수량·포함 토글이 잠겨 있는지(isBomForced="produce") 두 가지를 검증합니다.

## 언제 보나요?
- BOM 자동 전개 로직이나 produce 분기의 잠금 동작이 변경됐을 때 회귀 확인
- 생산 즉시 반영 흐름(결재 없음, `approvalKind="none"`) 동작 확인

## 중요한 내용
- 검증 시나리오 2개: ① wizard 완료 플로우(즉시 반영 다이얼로그) / ② BOM 자식 잠금(수량 disabled·"상위 품목과 함께 자동 처리")
- 자식 재고 소비 위치: 조립 부서 PRODUCTION 재고 (창고 재고 아님) — globalSetup 시드 필수
- 최종 버튼: "즉시 반영하기 N건" → 확인 다이얼로그 "즉시 반영" (결재 요청 아님)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/tests/e2e/_helpers.ts]] — `loginAsOperator`, `gotoWarehouseCompose`, `pickWorkType`
- [[ERP/frontend/tests/e2e/global-setup.ts]] — BOM(부모→자식 x2) 및 조립 부서 생산재고 시드 주체
