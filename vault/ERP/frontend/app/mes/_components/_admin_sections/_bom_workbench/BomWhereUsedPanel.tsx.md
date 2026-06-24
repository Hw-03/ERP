# BomWhereUsedPanel.tsx

## 이 파일은 뭐예요?
"사용처" 모드에서 선택된 품목이 어느 부모 BOM의 자식으로 등장하는지 1단계 역참조 결과를 보여주는 패널. 행 클릭 시 편집 모드로 전환하며 해당 부모를 바로 선택한다.

## 언제 보나요?
- 특정 원자재나 중간공정 품목이 어디서 쓰이는지 확인해야 할 때
- "사용처" 탭에서 역참조 목록이 표시되지 않을 때

## 중요한 내용
- `Props`: `selected: Item | null`, `rows: BOMDetailEntry[]`, `items: Item[]`, `onSelectParent: (parentId: string) => void`
- 데이터 소스: `BomWorkbench`가 `api.getBOMWhereUsed(parentId)` 결과를 `whereUsedRows`로 전달
- 행 클릭 → `onSelectParent` 호출 → BomWorkbench에서 `setMode("edit")` + `setParentId` 실행
- 부모 헤더(이름·코드)는 BomParentHeader에서 처리(이 컴포넌트에 없음)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/BomWorkbench.tsx]] — `getBOMWhereUsed` 호출 및 `onSelectParent` 정의
- [[ERP/frontend/lib/api.ts]] — `BOMDetailEntry` 타입
