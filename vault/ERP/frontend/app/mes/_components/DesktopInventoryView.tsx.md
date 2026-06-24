# DesktopInventoryView.tsx

## 이 파일은 뭐예요?
데스크톱 대시보드 탭의 재고 현황 화면입니다. KPI 카드, 생산 가능 수량 배너, 필터, 재고 테이블(좌측)과 품목 상세 우측 패널로 구성됩니다.

## 언제 보나요?
- 데스크톱 사이드바에서 "대시보드" 탭을 선택했을 때

## 중요한 내용
- **props**: `globalSearch`, `onStatusChange`, `onGoToWarehouse` (품목 클릭 시 입출고 탭으로 이동), `capacityData`, `onCapacityClick`, `canReceive`
- **필터 3종**: `selectedDepts`, `selectedModels`, `selectedProcessSteps` — 모두 `useToggleSet` 훅
- `scopedItems` → `filteredItems` 두 단계 필터: scope는 부서·모델·공정 단계, filteredItems는 추가로 KPI(`kpi` 상태) 적용
- 삭제(소프트삭제) 품목(`deleted_at`)은 목록에서 제외
- `displayLimit = 100` — 페이지 스크롤 추가 로드 방식
- `deferredValue` 로 로컬 검색 입력 debounce 없이 렌더 우선순위만 낮춤
- `useItemImageManifest` — mes_code 기준 이미지 파일명 매핑

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_hooks/useInventoryData.ts]] — 품목 목록 로딩·새로고침
- [[ERP/frontend/app/mes/_components/_hooks/useDesktopInventoryDerivations.tsx]] — KPI 카드·뱃지 파생값 계산
- [[ERP/frontend/app/mes/_components/_inventory_sections/DesktopInventoryRightPanel.tsx]] — 우측 품목 상세
- [[ERP/frontend/app/mes/_components/_inventory_sections/inventoryFilter.ts]] — `matchesSearch`, `matchesKpi`
