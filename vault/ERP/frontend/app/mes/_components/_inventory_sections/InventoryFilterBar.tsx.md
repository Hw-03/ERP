# InventoryFilterBar.tsx

## 이 파일은 뭐예요?
재고 화면의 필터 패널(`InventoryFilters`)과 검색/헤더 바(`InventoryTableStickyHeader`) 두 컴포넌트를 하나의 파일에 담고 있습니다. 필터 패널은 부서·모델·공정 구분 3열 그리드로 펼쳐지며, 스티키 헤더는 "자재 목록" 제목과 검색 입력창을 포함합니다.

## 언제 보나요?
- 재고 화면 상단에서 필터 토글 버튼을 누르면 `InventoryFilters` 패널이 열림 (`open` prop)
- `InventoryTableStickyHeader`는 테이블 위에 항상 고정(sticky) 표시

## 중요한 내용
- **`InventoryFilters` props**: `open`, `selectedDepts/Models/ProcessSteps`, 각 `toggle*`/`onClear*`/`onResetAll`, `isAnyFilterActive`, `productModels: ProductModel[]`
- 부서 칩: 전체 + 창고 + 6라인(튜브/고압/진공/튜닝/조립/출하) 고정 목록
- 공정 칩: R(원자재)/A(중간공정)/F(공정완료)/DEFECT(불량) 고정 목록
- 모델 칩: API에서 받은 `productModels` + "미분류" 고정 추가
- **`InventoryTableStickyHeader` props**: `searchValue`, `onSearchChange`, `count`, `isFiltered`, `onResetAllFilters?`
- 검색 placeholder: "품명 · 품목 코드 · 위치 · 공급처 검색"

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/common/📁_common]] — `FilterChip` 컴포넌트
- [[ERP/frontend/lib/api.ts]] — `ProductModel` 타입
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 토큰
