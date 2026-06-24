# 📁 _master_items_parts

## 이 폴더는 뭐예요?
관리자 품목 마스터 화면(`AdminMasterItems`)에서 품목을 추가하거나 편집할 때 쓰이는 폼 컴포넌트 모음입니다. 공통 입력 필드(`ItemFormFields`)를 중심으로 추가용(`AddItemForm`)과 편집용(`EditItemForm`) 두 가지 래퍼가 분리돼 있습니다.

## 언제 여기를 보나요?
- 품목 추가/편집 폼의 UI나 입력 항목을 변경해야 할 때
- 품목 코드 미리보기 로직(`previewFullCode`)을 수정해야 할 때
- 초기 재고 위치 입력 UI를 고쳐야 할 때

## 주요 파일
- `ItemFormFields.tsx` — 품목명·카테고리·단위·모델슬롯 등 모든 입력 필드의 공통 컴포넌트. `ItemFormData` 타입도 여기서 export.
- `AddItemForm.tsx` — 새 품목 추가 폼. 초기 재고 위치 입력 포함.
- `EditItemForm.tsx` — 기존 품목 편집 폼. 품목 코드 미리보기 포함.

## 관련 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminMasterItemsContext.tsx]] — 세 컴포넌트가 공유하는 컨텍스트 (폼 상태, addItem/editItem 액션)
- [[ERP/frontend/app/mes/_components/_admin_sections/adminShared.ts]] — `EMPTY_ADD_FORM`, `PROCESS_TYPE_OPTIONS`, `UNIT_OPTIONS` 상수
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminMasterItems.ts]] — 실제 API 호출 로직
