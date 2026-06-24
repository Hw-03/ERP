# MobileWarehouseMapScreen.tsx

## 이 파일은 뭐예요?
창고 지도 모바일 화면. 폰을 세로로 들어도 CSS `rotate(90deg) translateY(-100%)`로 강제 가로 전체 오버레이를 띄운다. 평면도(`FloorStage`) → 앵글 탭 → 정면도(`FrontStage`) → 칸 탭 → 오른쪽 상세 패널(`WarehouseJariPanel`) 순의 드릴다운 구조를 가지며, 품목명·코드 검색으로 바로 해당 칸을 찾을 수 있다.

## 언제 보나요?
- `MobileMoreScreen`에서 "창고 지도" 버튼을 눌렀을 때
- `MobileShell`이 `activeTab === "warehouseMap"`으로 전환되거나 더보기 탭에서 진입할 때

## 중요한 내용
- `MobileWarehouseMapScreen({ onStatusChange, onExit })` — 기본 export; `onExit`는 평면도에서 뒤로갈 때 더보기 탭으로 복귀하는 콜백
- `stage` 상태: `"floor" | "front"` — 현재 드릴다운 단계
- 강제 가로 CSS: `position: fixed`, `width: 100vh`, `height: 100vw`, `transform: rotate(90deg) translateY(-100%)`, `zIndex: 250`
- `SearchResults` — 검색어 입력 시 `CellHit[]`를 렌더하는 로컬 컴포넌트
- `buildCellIndex`, `cellKey`, `rowLabel` — `_warehouse_map_sections/helpers`의 순수 함수
- `reloadNonce` — 로드 실패 후 "다시 시도" 버튼으로 재요청

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_map_sections/WarehouseStages.tsx]] — `FloorStage`, `FrontStage`
- [[ERP/frontend/app/mes/_components/_warehouse_map_sections/WarehouseJariPanel.tsx]] — 칸 상세 패널
- [[ERP/frontend/app/mes/_components/_warehouse_map_sections/helpers.ts]] — `buildCellIndex`, `cellKey`, `rowLabel`
- [[ERP/frontend/lib/api/warehouse-map.ts]] — `warehouseMapApi.getMap()`
- [[ERP/frontend/app/mes/_components/mobile/screens/MobileMoreScreen.tsx]] — 진입점
