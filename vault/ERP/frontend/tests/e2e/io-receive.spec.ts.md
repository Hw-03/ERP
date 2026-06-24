# io-receive.spec.ts

## 이 파일은 뭐예요?
원자재 입고 wizard 전체 흐름을 검증하는 e2e 스펙입니다. 창고 역할로 로그인해 "원자재 입고" 작업 유형을 선택하고, 시드 원자재 품목을 낱개 입고 제출하면 "부서 결재 요청 완료" 다이얼로그가 뜨는지 확인합니다.

## 언제 보나요?
- 원자재 입고 wizard의 단계 흐름이나 라벨이 변경됐을 때 회귀 여부 확인
- 낱개 라인 입고 시 `approvalKind="department"`(부서 결재)로 가는지 확인할 때

## 중요한 내용
- 대상 시나리오: P2-1 / 시나리오 1 (원자재 입고)
- 검증 포인트: 최종 다이얼로그가 "부서 결재 요청 완료" + "승인 요청이 생성되었습니다." 텍스트
- 창고 역할 직원(`role: "warehouse"`)으로 로그인해야 "원자재 입고" work type이 노출됨

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/tests/e2e/_helpers.ts]] — `loginAsOperator`, `gotoWarehouseCompose`, `pickWorkType`
- [[ERP/frontend/tests/e2e/global-setup.ts]] — 시드 원자재(E2E원자재튜브) 생성 주체
