# AssignedModelsEditor.tsx

## 이 파일은 뭐예요?
조립 부서 직원의 담당 모델 목록을 편집하는 위젯입니다. 배열 순서가 우선순위를 뜻하며, ▲/▼ 버튼으로 순서를 바꾸고 ✕로 제거, 미선택 모델 칩을 클릭해 추가할 수 있습니다.

## 언제 보나요?
- 직원 관리 섹션에서 조립 부서 직원의 상세 편집 폼을 열었을 때
- 직원의 `assigned_model_slots` 편집이 필요할 때

## 중요한 내용
- `AssignedModelsEditor({ models, selected, onChange })` — export 컴포넌트
  - `models: ProductModel[]` — 전체 모델 목록
  - `selected: number[]` — 현재 담당 슬롯 배열 (순서 = 우선순위)
  - `onChange: (next: number[]) => void` — 변경 콜백
- `add(slot)` / `remove(slot)` / `move(idx, delta)` — 내부 헬퍼 함수
- 입출고 화면의 조립 그룹 내 정렬 시 이 순서를 사용

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/_employee_parts/EmployeeDetailGrid.tsx]] — 이 위젯을 렌더하는 부모
- [[ERP/frontend/app/mes/_components/_admin_sections/_employee_parts/EmployeeAddInline.tsx]] — 이 위젯을 렌더하는 또 다른 부모
