# MobileDashboardScreen.tsx

## 이 파일은 뭐예요?
모바일 대시보드 탭 화면. 데스크톱 `DesktopInventoryView`의 훅·필터·파생 로직을 그대로 재사용하되, 우측 SlidePanel 상세를 드래그 가능한 `BottomSheet`로 교체하고, 생산 가능 현황을 기본 접힌 토글로 배치해 393px 폭에서 품목 목록이 최대한 위로 올라오도록 구성된 재고 조회 화면이다.

## 언제 보나요?
- 모바일에서 하단 탭바 첫 번째 "대시보드" 탭을 누를 때
- `MobileShell`이 `activeTab === "dashboard"`일 때 렌더

## 중요한 내용
- `MobileDashboardScreen(props)` — 기본 export 컴포넌트. props: `globalSearch`, `onStatusChange`, `onGoToWarehouse`, `capacityData`, `onCapacityClick`, `onSummaryChange`, `canReceive`
- `PAGE_SIZE = 100` — 한 번에 표시할 품목 수 상한
- 생산 가능 현황(`InventoryCapacityPanel`)은 `capacityOpen` 상태로 접힘/펼침 제어, 기본값 `false`
- 품목 선택 시 `BottomSheet`가 슬라이드업으로 올라와 `InventoryDetailPanel` 렌더
- `useDesktopInventoryDerivations`, `useInventoryData`, `useToggleSet` 공용 훅 사용(데스크톱과 동일)
- 필터(부서·모델·공정) 변경 시 200ms 스켈레톤 노출

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_hooks/useInventoryData.ts]] — 품목 목록 로드 훅
- [[ERP/frontend/app/mes/_components/_hooks/useDesktopInventoryDerivations.tsx]] — KPI·배지·필터 파생값 훅
- [[ERP/frontend/app/mes/_components/_inventory_sections/InventoryDetailPanel.tsx]] — 품목 상세 패널
- [[ERP/frontend/app/mes/_components/mobile/MobileShell.tsx]] — 이 화면을 마운트하는 셸
