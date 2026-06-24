# ReworkBatchHeader.tsx

## 이 파일은 뭐예요?
재작업(DISASSEMBLE) 묶음의 헤더 행을 렌더합니다. 부모 로그(DISASSEMBLE 타입)의 품목명, 처리 자식 수, 수량을 한 줄로 표시하며, 클릭 시 우측 상세 패널을 열고 chevron 클릭으로 자식 행을 펼칩니다.

## 언제 보나요?
- `HistoryTable`에서 reference_no가 `defect-disassemble:`로 시작하는 묶음 그룹의 헤더 행

## 중요한 내용
- `export function ReworkBatchHeader({ group, expanded, onToggle, selected, onSelect, compact })` — `group`은 `LogGroup` 중 `type: "batch"` discriminated union
- 재작업 정체성에 맞게 빨강(`LEGACY_COLORS.red`) 고정 색상 사용
- `childCount` — DISASSEMBLE이 아닌 자식 로그 수 ("N종 처리")
- `ChevronToggleBtn` — 행 클릭(`onSelect`)과 chevron 클릭(`onToggle`)을 독립 처리

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryTable.tsx]] — 이 컴포넌트를 렌더하는 부모
- [[ERP/frontend/app/mes/_components/_history_sections/ReworkBatchDetail.tsx]] — 펼쳐지는 자식 행들
- [[ERP/frontend/app/mes/_components/_history_sections/historyTableHelpers.tsx]] — `ChevronToggleBtn`, `HISTORY_CELL_TRANSITION`
- [[ERP/frontend/app/mes/_components/_history_sections/historyBatchInterpreter.ts]] — `getHistoryActor`
