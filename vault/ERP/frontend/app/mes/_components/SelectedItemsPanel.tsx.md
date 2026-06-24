# SelectedItemsPanel.tsx

## 이 파일은 뭐예요?
입출고 작업 시 선택된 품목 목록을 보여주는 패널입니다. 각 품목마다 수량 스텝 입력, 현재 재고, 실행 후 예상 재고를 표 형태로 렌더링하고, 출고 시 재고 부족을 붉은 배경으로 경고합니다.

## 언제 보나요?
- 입출고 초안 작성 화면에서 선택된 품목 목록을 표시·수정할 때

## 중요한 내용
- `SelectedItemsPanel({ entries, onQuantityChange, onRemove, outgoing? })`
  - `entries: SelectedEntry[]` — `{ item: Item; quantity: number }` 배열
  - `outgoing` — `true`면 출고 모드: 재고 부족 경고 활성화
- `useDeptColorLookup()` — 부서 색상 lookup 클로저 (DepartmentsContext)
- `getStockState` — 재고 상태 색상 계산
- `mesCodeDeptBadge` — 품목 코드에서 부서 배지 추출
- `StepBtn` — ±1·±10 스텝 버튼 내부 컴포넌트

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/DepartmentsContext.tsx]] — `useDeptColorLookup`
- [[ERP/frontend/lib/mes/inventory.ts]] — `getStockState`
- [[ERP/frontend/lib/mes/process.ts]] — `mesCodeDeptBadge`
