# EditItemForm.tsx

## 이 파일은 뭐예요?
관리자 품목 마스터 화면에서 선택된 품목을 편집할 때 표시되는 폼 컴포넌트입니다. `AdminMasterItemsContext`에서 `editForm`·`setEditForm`·`productModels`를 가져와 `ItemFormFields`에 전달하며, `showMesCode` 플래그로 품목 코드 미리보기 섹션을 활성화합니다.

## 언제 보나요?
- 관리자 품목 목록에서 특정 품목을 선택했을 때 우측 패널에 표시되는 편집 폼
- `selectedItem.item_name`이 폼 상단 제목으로 보일 때

## 중요한 내용
- **`EditItemForm({ selectedItem })`** (exported component): `Item` 타입의 `selectedItem` prop 하나만 받음.
- `editForm`과 `setEditForm`은 `useAdminMasterItemsContext()`에서 가져옴 — props로 전달받지 않음.
- `handleSetForm`: `ItemEditForm`과 `ItemFormData` 사이의 타입 캐스팅 어댑터. `setEditForm`의 내부 타입을 `ItemFormFields`가 기대하는 `ItemFormData` 형태로 맞춰줌.
- `ItemFormFields`에 `showMesCode` 플래그를 전달해 품목 코드 미리보기 활성화.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/_master_items_parts/ItemFormFields.tsx]] — 실제 입력 필드 렌더링 컴포넌트
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminMasterItems.ts]] — `ItemEditForm` 타입 및 `editForm`/`setEditForm` 상태 출처
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminMasterItemsContext.tsx]] — 컨텍스트 Provider
