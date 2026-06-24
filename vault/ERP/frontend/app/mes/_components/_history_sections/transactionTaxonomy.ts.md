# transactionTaxonomy.ts

## 이 파일은 뭐예요?
거래 타입 분류 상수·술어·scope 모델을 정의합니다. 창고 관련/부서 내부/모호한 타입 분류, 재작업 여부 판별, 사용자별 기본 scope 결정 등 history 전반의 분류 로직을 한 곳에 모아놓았습니다.

## 언제 보나요?
- `HistoryCalendarStrip` — 날짜 셀 창고/부서/조정 카운트 분류
- `HistoryLogRow` — `isReworkOperation`으로 재작업 빨강 처리
- `historyTableHelpers` — `isReworkOperation`, `BatchHeader`/`OpBatchHeader`에서 색상 결정

## 중요한 내용
- `export type HistoryScope = "ALL" | "WAREHOUSE_INVOLVED" | "DEPT_INTERNAL"`
- `WAREHOUSE_INVOLVED_TYPES` — RECEIVE, SHIP, TRANSFER_TO_PROD, TRANSFER_TO_WH
- `DEPT_INTERNAL_TYPES` — TRANSFER_DEPT, BACKFLUSH, PRODUCE, DISASSEMBLE
- `AMBIGUOUS_TYPES` — ADJUST, MARK_DEFECTIVE, SUPPLIER_RETURN (bucket 분석 필요)
- `isWarehouseInvolvedType / isDepartmentInternalType / isAmbiguousType` — 타입 판별 술어
- `isAdjustmentLike(log)` — ADJUST 타입만 true (달력 "조정" 카운트용)
- `isReworkOperation(log, batch?)` — DISASSEMBLE 또는 sub_type="disassemble" 이면 true
- `getDefaultHistoryScopeForOperator(operator)` — warehouse_role이 primary/deputy이면 WAREHOUSE_INVOLVED, 그 외 DEPT_INTERNAL
- `classifyHistoryScope(log, batch?)` — IoBatch bucket 분석으로 정확한 scope 판별

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryCalendarStrip.tsx]] — `isWarehouseInvolvedType`, `isDepartmentInternalType`, `isAdjustmentLike`
- [[ERP/frontend/app/mes/_components/_history_sections/historyTableHelpers.tsx]] — `isReworkOperation`
