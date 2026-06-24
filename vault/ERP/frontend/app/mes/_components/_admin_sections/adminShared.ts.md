# adminShared.ts

## 이 파일은 뭐예요?
관리자 화면 전반에서 공유하는 상수와 타입을 모아 놓은 파일입니다. 공정 유형 옵션, 모델 슬롯, 단위, 품목 추가 폼 초기값, 직원 추가 폼 초기값, BOM 카테고리, 카테고리 색상 함수 등이 정의돼 있습니다.

## 언제 보나요?
- 품목 추가/편집 폼에서 공정 유형이나 단위 선택지가 필요할 때
- BOM 관리에서 카테고리 필터나 색상 매핑이 필요할 때
- 직원 추가 폼의 초기 상태가 필요할 때

## 중요한 내용
- `PROCESS_TYPE_OPTIONS` — 18종 공정 코드 옵션 배열 (TR~PF)
- `MODEL_SLOTS` — slot 1~5, 각 모델명·기호 정의 (DX3000·COCOON·SOLO·ADX4000W·ADX6000)
- `UNIT_OPTIONS` — `["EA", "SET", "kg", "g", "m", "mm", "L", "box"]`
- `EMPTY_ADD_FORM` / `AddForm` — 품목 추가 폼 초기값·타입
- `EMPTY_EMPLOYEE_FORM` / `EmployeeAddForm` — 직원 추가 폼 초기값·타입
- `BOM_PARENT_CATS` / `BOM_CHILD_CATS` — BOM 카테고리 필터 목록
- `bomCategoryColor(code)` — 공정 코드 첫 글자(T/H/V/N/A/P)로 색상 반환

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/_master_items_parts/AddItemForm.tsx]] — `EMPTY_ADD_FORM` 사용
- [[ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/BomWorkbench.tsx]] — `BOM_PARENT_CATS`, `bomCategoryColor` 사용
- [[ERP/frontend/app/mes/_components/_admin_sections/_employee_parts/EmployeeAddInline.tsx]] — `EMPTY_EMPLOYEE_FORM` 사용
