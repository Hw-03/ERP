# inventoryFilter.ts

## 이 파일은 뭐예요?
재고 화면의 필터링·계산에 쓰이는 순수 헬퍼 함수 모음입니다. `DesktopInventoryView`에서 분리된 4개 함수(`getMinStock`, `safeQty`, `matchesSearch`, `matchesKpi`)를 담고 있습니다.

## 언제 보나요?
- 재고 필터 로직을 수정할 때 (KPI 분류 기준, 검색 매칭 등)
- `DesktopInventoryView`나 관련 컴포넌트가 품목 필터링할 때 import

## 중요한 내용
- `getMinStock(item)`: `item.min_stock`이 null이면 0 반환
- `safeQty(item)`: `item.quantity`를 Number로 변환, NaN이면 0
- `matchesSearch(item, keyword)`: `matchesItemSearch` 위임 (품명·코드·위치·공급처 검색)
- `matchesKpi(item, kpi: KpiFilter)`: NORMAL=재고≥안전재고>0, LOW=0<재고<안전재고, ZERO=재고≤0, ALL=전부

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_inventory_sections/InventoryKpiPanel.tsx]] — `KpiFilter` 타입 정의
- [[ERP/frontend/lib/itemSearch.ts]] — `matchesItemSearch` 구현체
