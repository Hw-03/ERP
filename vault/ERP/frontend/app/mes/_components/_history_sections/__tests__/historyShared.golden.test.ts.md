# historyShared.golden.test.ts

## 이 파일은 뭐예요?
`_history_sections` 폴더의 공개 유틸 함수들(`historyBatchInterpreter`, `transactionTaxonomy`, `historyQuery`, `historyTheme`, `historyFormat`)의 출력값을 C1 단계에서 골든(스냅샷)으로 고정해 두는 Vitest 테스트 파일입니다. 이후 C2–C6 증분 작업에서도 이 테스트가 100% 그린이면 동작이 그대로 보존됨을 증명합니다.

## 언제 보나요?
- 입출고 내역 관련 유틸 함수(`getHistoryDisplayLabel`, `getHistoryLineSignedQuantity` 등)를 수정할 때 회귀 여부 확인 시
- History 3차 재설계 증분(C2–C6) 작업 전후 검증 시

## 중요한 내용
- `makeLine` / `makeBundle` / `makeBatch` — 공통 픽스처 빌더(로컬 헬퍼). 실제 `IoLine` / `IoBundle` / `IoBatch` 타입을 기반으로 오버라이드 가능
- 검증 대상 함수: `getHistoryDisplayLabel`, `getHistoryDisplaySubLabel`, `getHistoryOperationLabel`, `getHistoryFlowLabel`, `describeBatchFlow`, `getBatchFlowEndpoints`, `getHistoryLineSignedQuantity`, `getHistoryMovementSummary`, `getHistoryBomParentLine`, `getHistoryLineStatusLabel`
- 검증 대상 분류: `classifyHistoryScope`, `getDefaultHistoryScopeForOperator`, `isExceptionLike`, `isAdjustmentLike`, `isReworkOperation`
- 검증 대상 날짜/기간: `getPeriodStart`, `dateFilterToFrom`, `parseUtc`, `formatHistoryDate`, `formatHistoryDateTimeLong`, `toDateKey`
- 검증 대상 테마: `rowTint` — transaction_type별 배경색 RGBA 값 고정

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/historyBatchInterpreter.ts]] — 라벨·부호·요약 함수 구현 본체
- [[ERP/frontend/app/mes/_components/_history_sections/transactionTaxonomy.ts]] — 스코프 분류·예외 판별 함수
- [[ERP/frontend/app/mes/_components/_history_sections/historyQuery.ts]] — 기간 필터 유틸
- [[ERP/frontend/app/mes/_components/_history_sections/historyTheme.ts]] — 행 배경 tint 색상 매핑
- [[ERP/frontend/app/mes/_components/_history_sections/historyFormat.ts]] — 날짜 포맷 유틸
