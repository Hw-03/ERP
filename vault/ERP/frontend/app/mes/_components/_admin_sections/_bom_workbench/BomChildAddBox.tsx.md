# BomChildAddBox.tsx

## 이 파일은 뭐예요?
BOM 편집 화면 가운데 패널. 현재 선택된 부모 품목에 추가할 수 있는 자식 후보 목록을 검색·부서칩·단계칩으로 필터링해 보여주고, 후보 클릭 시 인라인 수량 입력 영역을 펼쳐 추가(Enter) 또는 취소(Esc)를 처리한다.

## 언제 보나요?
- BOM 편집 모드에서 "하위 품목 추가" 동작이 이상할 때
- 자기참조·이미 자식인 항목이 비활성으로 표시되는지 확인할 때
- 수량 입력 UX(Enter/Esc, 자동 focus) 동작을 수정할 때

## 중요한 내용
- `Props`: `parent: Item`, `bomRows: BOMEntry[]`, `items: Item[]`, `onAdd: (childId, childName, qty) => Promise<boolean>`
- 자기참조 제외: `i.item_id !== parent.item_id`
- 이미 자식인 항목: `childIdSet.has(c.item_id)` → 버튼 disabled + "등록됨" 표시
- `expandedId` 상태로 한 번에 하나의 행만 수량 입력 펼침
- 부서 칩: `DEPT_LETTERS` 6개 + "전체" / 단계 칩: ALL·R·A·F

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/BomWorkbench.tsx]] — `handleAdd` 구현체 전달
- [[ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/BomSearchInput.tsx]] — 검색 입력 컴포넌트
- [[ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/BomBadge.tsx]] — 배지 렌더
