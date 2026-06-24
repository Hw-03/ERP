# BomParentList.tsx

## 이 파일은 뭐예요?
BOM 편집/사용처 화면 좌측 부모 품목 리스트. 부서·검색어·단계·상태(완료/작업중/미착수) 4중 필터를 조합해 항목을 표시하고 클릭 시 선택 상태를 부모에 전달한다.

## 언제 보나요?
- 좌측 리스트에서 특정 품목이 보이지 않거나 필터가 오동작할 때
- 편집 모드(R 단계 제외)와 사용처 모드(전 단계 포함)의 필터 차이를 파악할 때

## 중요한 내용
- `Props`: `dept`, `items`, `allBomRows`, `completedSet`, `statusFilter`, `selectedId`, `onSelect`, `mode`
- 편집 모드: `stageOf(i.process_type_code) !== "R"` 로 원자재 제외
- 사용처 모드: 단계 필터 ALL·R·A·F 전부 노출 (`STAGE_FILTERS_WHEREUSED`)
- `statusFilter`(상단 KPI 카드 제어): 편집 모드에서만 `bomStatusOf` 로 걸러냄
- 선택된 행: 파란 10% tint 배경

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/BomStatsRow.tsx]] — `StatusFilter` 타입·KPI 카드 제어
- [[ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/bomDept.ts]] — `bomStatusOf`, `stageOf`
- [[ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/BomWorkbench.tsx]] — `setParentId` 전달
