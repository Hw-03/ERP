# AddItemForm.tsx

## 이 파일은 뭐예요?
관리자 품목 마스터 화면에서 새 품목을 추가할 때 표시되는 폼 컴포넌트입니다. `AdminMasterItemsContext`에서 `addForm`·`setAddForm`·`addItem`·`productModels`·`setAddMode`를 가져오고, `ItemFormFields`를 `showInitialLocations` 모드로 렌더링해 초기 재고 위치를 부서별로 입력할 수 있게 합니다.

## 언제 보나요?
- 관리자 품목 목록 화면에서 "+ 품목 추가" 버튼을 눌렀을 때 우측 패널에 표시
- 우상단 X 버튼으로 닫으면 `setAddMode(false)` + 폼 초기화

## 중요한 내용
- **`AddItemForm()`** (exported component): props 없음 — 전부 컨텍스트에서 가져옴.
- X 버튼 클릭 시 `EMPTY_ADD_FORM`으로 폼 리셋 (`adminShared`에서 import).
- "추가" 버튼 클릭 시 `onAddItem()` 호출 — 실제 API 호출 로직은 `useAdminMasterItems` 훅에 있음.
- 품번(mes_code)은 자동 부여 안내 문구("예: RM-00972")만 표시, 사용자가 직접 입력하지 않음.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/_master_items_parts/ItemFormFields.tsx]] — 실제 입력 필드 렌더링 컴포넌트
- [[ERP/frontend/app/mes/_components/_admin_sections/adminShared.ts]] — `EMPTY_ADD_FORM` 초기값 출처
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminMasterItemsContext.tsx]] — `addForm`, `setAddForm`, `addItem`, `setAddMode` 제공
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminMasterItems.ts]] — `addItem` 함수 실제 구현
