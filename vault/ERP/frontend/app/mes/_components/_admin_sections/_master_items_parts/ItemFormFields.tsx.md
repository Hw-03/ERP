# ItemFormFields.tsx

## 이 파일은 뭐예요?
품목 추가/편집 폼에서 공통으로 쓰이는 입력 필드 묶음 컴포넌트입니다. 품목명·자재분류·공급사·안전재고·카테고리·단위·사용 제품(모델 슬롯)을 렌더링하며, 옵션 플래그(`showInitialLocations`, `showMesCode`)로 초기 재고 위치 입력이나 품목 코드 미리보기 섹션을 토글합니다.

## 언제 보나요?
- `AddItemForm`에서 새 품목을 추가할 때 (초기 재고 위치 섹션 표시)
- `EditItemForm`에서 기존 품목을 수정할 때 (품목 코드 미리보기 섹션 표시)

## 중요한 내용
- **`ItemFormData`** (exported type): 폼 상태 전체를 나타내는 타입. `item_name`, `legacy_item_type`, `supplier`, `min_stock`, `process_type_code`, `unit`, `model_slots`, `initial_quantity?`, `mes_code?`, `initial_locations?` 포함.
- **`ItemFormFields`** (exported component): `form`, `setForm`, `showInitialQuantity?`, `showInitialLocations?`, `showMesCode?`, `productModels?` props 수신.
- **`previewFullCode`**: `model_slots`와 `process_type_code` 변경에 따라 `mes_code` 미리보기를 계산. 카테고리가 바뀌면 "저장 시 부여" 안내, 사용 제품만 바뀌면 serial 유지.
- **`MesCodeSection`**: `showMesCode` 플래그가 true일 때만 렌더링. 현재 코드 prefix를 보라색 뱃지로 표시하고 읽기 전용 코드 미리보기 제공.
- `LEGACY_COLORS`, `AppSelect`, `PROCESS_TYPE_OPTIONS`, `UNIT_OPTIONS`, `useDepartments` 의존.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/_master_items_parts/AddItemForm.tsx]] — 이 컴포넌트를 `showInitialLocations` 모드로 사용
- [[ERP/frontend/app/mes/_components/_admin_sections/_master_items_parts/EditItemForm.tsx]] — 이 컴포넌트를 `showMesCode` 모드로 사용
- [[ERP/frontend/app/mes/_components/_admin_sections/adminShared.ts]] — `PROCESS_TYPE_OPTIONS`, `UNIT_OPTIONS` 상수 출처
- [[ERP/frontend/app/mes/_components/common/AppSelect.tsx]] — 드롭다운 공용 컴포넌트
