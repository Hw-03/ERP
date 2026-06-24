# employeeDetailPrimitives.tsx

## 이 파일은 뭐예요?
직원 상세·추가 폼에서 반복적으로 쓰이는 UI 원시 컴포넌트 4종(DetailCardSlot·FieldRow·TextInput·SelectInput)을 모아 둔 파일입니다. 모든 컴포넌트는 LEGACY_COLORS 토큰으로 스타일이 통일되어 있습니다.

## 언제 보나요?
- `EmployeeDetailGrid`나 `EmployeeAddInline`에서 카드·입력 필드·레이블을 조합할 때
- 직원 관련 폼 UI를 새로 추가하거나 스타일을 수정할 때

## 중요한 내용
- `DetailCardSlot({ title, children })`: 둥근 카드 래퍼. title은 소문자+추적 간격 스타일로 렌더됨
- `FieldRow({ label, htmlFor?, required?, children })`: label + 필드 wrapper. `required=true`이면 빨간 `*` 표시
- `TextInput({ id?, value, onChange, placeholder? })`: 단일 텍스트 입력. 포커스 시 `--c-blue` 테두리 변경
- `SelectInput({ value, onChange, options })`: `AppSelect`를 s1 배경으로 래핑한 드롭다운

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/common/AppSelect.tsx]] — SelectInput이 내부적으로 사용하는 공통 드롭다운 컴포넌트
- [[ERP/frontend/app/mes/_components/_admin_sections/_employee_parts/EmployeeDetailGrid.tsx]] — 이 컴포넌트들을 조합해 직원 편집 그리드를 구성
- [[ERP/frontend/app/mes/_components/_admin_sections/_employee_parts/EmployeeAddInline.tsx]] — 이 컴포넌트들을 조합해 직원 추가 폼을 구성
