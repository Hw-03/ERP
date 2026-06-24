# HistoryFilterPanel.tsx

## 이 파일은 뭐예요?
입출고 내역의 유일한 필터 패널입니다. "필터" 버튼을 누르면 나타나며, 부서 구분·모델 구분·거래 종류 3개 카드로 구성됩니다. 모든 카테고리가 다중 선택 가능하고, 전체 초기화 버튼이 있습니다.

## 언제 보나요?
- `HistoryFilterBar`에서 "필터" 버튼을 클릭해 `filterPanelOpen`이 true일 때

## 중요한 내용
- `export function HistoryFilterPanel({ open, departmentCounts, selectedDepts, toggleDept, clearDepts, models, selectedModels, toggleModel, clearModels, selectedOps, toggleOp, clearOps, onResetAll })` — props 13개
- 부서 칩은 서버 `departmentCounts`(기간 기준 동적)로 생성, 건수 0인 부서는 제외
- `normalizeDepartment` 호출로 "DepartmentEnum.X" 형식 방어
- `OPERATION_OPTIONS` — 고정 13종 거래 종류 옵션(`historyQuery.ts`)
- 3차 개편: KPI 박스 클릭 필터 폐기 후 이 패널이 유일 필터 진입점

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/historyQuery.ts]] — `OPERATION_OPTIONS`
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryFilterBar.tsx]] — 이 패널을 토글하는 상위 바
