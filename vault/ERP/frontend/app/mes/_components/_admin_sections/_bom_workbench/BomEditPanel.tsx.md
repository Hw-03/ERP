# BomEditPanel.tsx

## 이 파일은 뭐예요?
BOM 편집 화면 우측 패널. 현재 선택된 부모의 BOM 구성 목록(자식 품목 + 수량)을 `BomRow` 리스트로 표시하며, 부모 헤더(배지·이름·코드·상태)는 BomDeptTabs 행으로 hoist 되어 이 컴포넌트에 없다.

## 언제 보나요?
- "현재 구성 N건" 목록의 렌더링이나 스크롤이 이상할 때
- 비어 있을 때 표시하는 안내 문구를 수정할 때

## 중요한 내용
- `Props`: `parent: Item | null`, `bomRows: BOMEntry[]`, `items: Item[]`, `onSaveQty`, `onRequestDelete`
- parent가 null이면 EmptyState("좌측에서 상위 품목을 선택하세요") 반환
- `itemMap`: `items`를 `item_id → Item`으로 변환 후 BomRow에 `childItem` 전달

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/BomRow.tsx]] — 개별 행 렌더
- [[ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/BomWorkbench.tsx]] — `handleSaveQty`, `setDeleteRequest` 전달
