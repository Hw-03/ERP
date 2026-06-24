# InventoryItemsTable.tsx

## 이 파일은 뭐예요?
필터링된 품목 목록을 테이블로 렌더하는 컴포넌트입니다. 로딩/에러/빈 결과 상태를 처리하고, 100개씩 페이지네이션하는 "100개 더 보기" 버튼을 제공합니다. 실제 행은 `InventoryItemRow`에 위임합니다.

## 언제 보나요?
- 재고 화면에서 필터·검색 결과를 표시할 때
- 결과가 0건이면 EmptyState(필터 초기화 버튼 포함), 에러 시 LoadFailureCard

## 중요한 내용
- Props: `error`, `loading`, `filteredItems`, `displayLimit`, `setDisplayLimit`, `selectedItem`, `onSelectItem`, `activeFilterCount`, `hasKpiFilter`, `onRetry`, `onResetAllFilters`, `imageManifest?`
- `PAGE_SIZE = 100`; `filteredItems.slice(0, displayLimit)`로 렌더
- 헤더 컬럼: 상태/이미지(sm 이상)/품목명/품목 코드(sm)/부서(sm)/현재고/안전재고(sm)
- `imageManifest`: `mes_code → filename` 매핑, InventoryItemRow의 이미지 표시에 사용
- 정렬 없음 — 들어온 `filteredItems` 순서 그대로 표시 (등록·관리자 설정 순)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_inventory_sections/InventoryItemRow.tsx]] — 개별 행 컴포넌트
- [[ERP/frontend/app/mes/_components/common/EmptyState.tsx]] — 빈 결과 상태 컴포넌트
- [[ERP/frontend/app/mes/_components/common/LoadFailureCard.tsx]] — 에러 상태 컴포넌트
