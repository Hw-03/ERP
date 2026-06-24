# useDesktopInventoryDerivations.tsx

## 이 파일은 뭐예요?
`DesktopInventoryView`에서 재고 KPI 카드, 필터 상태 배지, 헤더 재고 상태 뱃지를 계산하는 파생(derivation) 훅입니다. 화면 렌더에 필요한 가공 데이터를 useMemo로 묶어 컴포넌트 본체에서 분리했습니다.

## 언제 보나요?
- KPI 카드(전체/정상/부족/품절) 수치가 화면과 맞지 않을 때
- 필터 활성 건수 뱃지가 잘못 계산될 때
- 선택 품목의 재고 상태 색상 뱃지(정상/부족/품절) 로직을 수정할 때

## 중요한 내용
- `useDesktopInventoryDerivations({ items, scopedItems, filteredItems, selectedDepts, selectedModels, selectedProcessSteps, deferredLocalSearch, displayItem, onSummaryChange })`
- 반환값: `{ isFiltered, activeFilterCount, kpiCards, headerBadge }`
- `kpiCards`: `KpiCard[]` — 전체/정상/부족/품절 4개, `LEGACY_COLORS` 색상 적용
- `activeFilterCount`: 부서+모델+공정 선택 수 + 검색어 유무(0 또는 1) 합산
- `headerBadge`: `ReactNode` — `getStockState`로 현재 선택 품목 재고 상태 배지 렌더
- `onSummaryChange`: low/zero 카운트가 바뀔 때마다 상위 컴포넌트에 알림
- Round-13 (#20) 추출 이력

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_inventory_sections/InventoryKpiPanel.tsx]] — KpiCardData 타입
- [[ERP/frontend/app/mes/_components/_inventory_sections/inventoryFilter.ts]] — getMinStock, safeQty 함수
- [[ERP/frontend/lib/mes/inventory.ts]] — getStockState 함수
- [[ERP/frontend/lib/mes/color.ts]] — LEGACY_COLORS 색상 토큰
