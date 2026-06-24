# WarehouseDraftPanelTabs.tsx

## 이 파일은 뭐예요?
`DesktopWarehouseView`에서 섹션 탭(`sectionTab`)에 따라 cart/mine/queue/handover/dept-queue 중 하나의 패널만 렌더링하는 분기 컴포넌트. compose 탭일 때는 null을 반환한다.

## 언제 보나요?
- 창고 화면에서 상단 섹션 탭이 바뀔 때마다 호출됨
- `DesktopWarehouseView`가 패널 영역을 이 컴포넌트에 위임할 때

## 중요한 내용
- `WarehouseDraftPanelTabs(props: WarehouseDraftPanelTabsProps)` — 주요 export
- `WarehouseDraftPanelTabsProps` — 인터페이스 export, sectionTab·canSeeQueue·canSeeDeptQueue·operator·refreshNonce 등 10개 이상 props
- 탭별 패널: `cart` → `DraftCartPanel`, `mine` → `MyRequestsPanel`, `queue` → `WarehouseQueuePanel`, `handover` → `HandoverSectionPanel`, `dept-queue` → `DepartmentQueuePanel`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_sections/WarehouseSectionTabs.tsx]] — 어떤 탭이 활성인지 정의하는 `WarehouseSectionTab` 타입
- [[ERP/frontend/app/mes/_components/_warehouse_sections/DraftCartPanel.tsx]] — cart 탭 패널
- [[ERP/frontend/app/mes/_components/_warehouse_sections/MyRequestsPanel.tsx]] — mine 탭 패널
- [[ERP/frontend/app/mes/_components/_warehouse_sections/WarehouseQueuePanel.tsx]] — queue 탭 패널
- [[ERP/frontend/app/mes/_components/_warehouse_sections/HandoverSectionPanel.tsx]] — handover 탭 패널
- [[ERP/frontend/app/mes/_components/_warehouse_sections/DepartmentQueuePanel.tsx]] — dept-queue 탭 패널
