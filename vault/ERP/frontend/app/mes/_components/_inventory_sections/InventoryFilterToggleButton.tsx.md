# InventoryFilterToggleButton.tsx

## 이 파일은 뭐예요?
재고 화면 검색 바 오른쪽에 위치하는 "필터" 토글 버튼 컴포넌트입니다. 필터가 열려 있으면 파란색 강조 스타일로, 닫혀 있으면 기본 회색으로 표시되며 ChevronDown 아이콘이 회전합니다.

## 언제 보나요?
- 재고 화면 검색 바 영역에서 항상 표시
- `filtersOpen`이 `true`이면 파란 테두리·배경, `false`이면 기본 스타일

## 중요한 내용
- Props: `filtersOpen: boolean`, `activeFilterCount: number`, `onToggle: () => void`
- `aria-expanded={filtersOpen}`, `aria-controls="inventory-filter-panel"` — 접근성 연결
- `activeFilterCount`는 현재 렌더에서 표시에 직접 사용하지 않음 (호출처에서 배지 등에 활용 가능)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_inventory_sections/InventoryFilterBar.tsx]] — 이 버튼이 제어하는 필터 패널 (`id="inventory-filter-panel"`)
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 토큰
