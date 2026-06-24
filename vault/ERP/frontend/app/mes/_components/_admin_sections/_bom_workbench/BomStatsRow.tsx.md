# BomStatsRow.tsx

## 이 파일은 뭐예요?
BOM 관리 화면 상단의 통계 KPI 카드 4장(전체·완료·작업중·미착수)을 렌더하며, 카드 클릭이 곧 부모 리스트의 상태 필터 전환으로 이어진다. 같은 카드를 다시 누르면 "ALL"로 해제된다.

## 언제 보나요?
- KPI 카드 숫자가 실제 리스트 건수와 다를 때
- 상태 필터 클릭 동작(토글/해제)을 수정할 때

## 중요한 내용
- `StatusFilter` 타입 export: `"ALL" | BomStatus` — BomParentList가 import해 사용
- `Props`: `total`, `done`, `wip`, `todo`, `active`, `onChange`
- `AdminKpiBar` 공통 컴포넌트에 위임 (톤·크기 일관성)
- "ALL" 카드는 다시 눌러도 해제 없음 (항상 ALL 세팅)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/bomDept.ts]] — `BomStatus` 타입
- [[ERP/frontend/app/mes/_components/_admin_sections/_admin_primitives/📁__admin_primitives]] — `AdminKpiBar` 컴포넌트
