# AdminMasterItemsContext.tsx

## 이 파일은 뭐예요?
품목 관리 섹션의 상태를 React Context로 감싸는 파일입니다. `useAdminMasterItems` 훅의 반환값을 Provider로 주입하고, 하위 컴포넌트가 `useAdminMasterItemsContext()`로 품목 목록·선택·추가 상태를 꺼내 씁니다.

## 언제 보나요?
- `AdminMasterItemsSection`에서 품목 목록·선택 품목·검색 상태를 공유할 때
- "품목 관리" 섹션이 마운트될 때 (`AdminSectionContent`에서 section === "items"일 때)

## 중요한 내용
- `AdminMasterItemsProvider` — Context Provider, `UseAdminMasterItemsArgs` 받아 훅 실행
- `useAdminMasterItemsContext()` — 품목 상태 접근 훅 (Provider 밖에서 호출 시 throw)
- `AdminMasterItemsState` 타입은 `useAdminMasterItems` 훅에 정의됨

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminMasterItems.ts]] — 실제 상태 로직
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminSectionContent.tsx]] — Provider 주입부
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminMasterItemsSection.tsx]] — Context 소비자
