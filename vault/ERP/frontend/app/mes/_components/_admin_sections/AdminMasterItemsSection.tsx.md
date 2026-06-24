# AdminMasterItemsSection.tsx

## 이 파일은 뭐예요?
관리자 화면의 "품목 관리" 섹션 본체 컴포넌트입니다. 좌측 품목 목록(드래그 reorder 포함)과 우측 품목 상세(기본정보·재고정보·BOM/사용처·변경이력 탭)를 2열 레이아웃으로 구성합니다.

## 언제 보나요?
- `AdminSectionContent`에서 `section === "items"`일 때 렌더됨

## 중요한 내용
- `AdminMasterItemsSection({ allBomRows })` — export 컴포넌트
- `useAdminMasterItemsContext()` — 품목 목록·선택·검색·추가·저장·삭제·복구·reorder Context 상태 소비
- Pointer Events 기반 드래그 reorder — HTML5 DnD 대신 PointerDown/Move/Up 이벤트 (`handleGripPointerDown/Move/Up`)
- `DETAIL_TABS`: `"info" | "stock" | "bom" | "history"` 4탭
- `ItemStockTab` — 현재재고·창고보관·안전재고·재고상태 4격자
- `ItemBomTab` — `allBomRows`에서 `parent_item_id` / `child_item_id` 필터로 구성품·사용처 표시
- `EditItemForm` — "기본 정보" 탭 내용
- `useRegisterDirty` / `useLocalDirtyGuard` — 더티 가드

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminMasterItemsContext.tsx]] — 상태 Context
- [[ERP/frontend/app/mes/_components/_admin_sections/_master_items_parts/EditItemForm.tsx]] — 기본 정보 탭 폼
- [[ERP/frontend/app/mes/_components/_admin_sections/_master_items_parts/AddItemForm.tsx]] — 추가 모드 폼
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminSectionContent.tsx]] — 마운트 부모
