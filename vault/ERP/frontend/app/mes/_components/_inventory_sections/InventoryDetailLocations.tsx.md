# InventoryDetailLocations.tsx

## 이 파일은 뭐예요?
품목 상세 패널 안의 "위치별 재고" 섹션 컴포넌트입니다. 창고 재고, 부서별 정상 재고, 부서별 불량 재고를 행으로 나열하며, 불량 행은 클릭 시 `/?tab=defect`로 이동하는 버튼으로 렌더합니다.

## 언제 보나요?
- `InventoryDetailPanel`이 `warehouse_qty > 0` 또는 `locations`에 수량이 있는 품목을 표시할 때
- 불량 재고가 있는 부서 행은 빨간색으로 강조되며 클릭 가능

## 중요한 내용
- Props: `item: Item`, `getDeptColor: (name: string) => string`
- `locations` 중 `quantity > 0`인 항목만 필터링
- PRODUCTION 행 바로 다음에 같은 부서의 DEFECTIVE 행을 인접 배치
- 불량 행은 `<button>` — 클릭 시 `router.push("/?tab=defect")`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_inventory_sections/InventoryDetailPanel.tsx]] — 이 컴포넌트를 호출하는 부모
- [[ERP/frontend/lib/api.ts]] — `Item` 타입 (`locations`, `warehouse_qty` 필드)
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 토큰
