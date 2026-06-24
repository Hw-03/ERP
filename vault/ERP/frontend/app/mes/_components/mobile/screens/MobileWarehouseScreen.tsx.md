# MobileWarehouseScreen.tsx

## 이 파일은 뭐예요?
모바일 입출고 탭 화면. 데스크톱 `DesktopWarehouseView`의 데이터·권한·섹션 오케스트레이션을 따르되, 입력(compose) 섹션을 모바일 풀스크린 위저드(`MobileIoComposeWizard`)로 교체한다. 대기열·장바구니·부서대기 섹션은 기존 `WarehouseDraftPanelTabs`를 재사용한다. compose 작성 중 다른 탭으로 이탈하면 `MobileDirtyLeaveSheet`로 확인을 요구한다.

## 언제 보나요?
- 모바일 하단 탭바 "입출고" 탭을 누를 때
- `MobileShell`이 `activeTab === "warehouse"`일 때 렌더

## 중요한 내용
- `MobileWarehouseScreen(props)` — 기본 export; props: `globalSearch`, `onStatusChange`, `preselectedItem`, `entryIntent`, `onSubmitSuccess`, `onComposeDirtyChange`, `flushDraftRef`
- `sectionTab` 상태: `"compose" | "cart" | "mine" | "queue" | "dept-queue" | "handover"` — 섹션 탭 선택
- `composeDirty` — 입력 중인지 여부; 상위 `MobileShell`에 `onComposeDirtyChange`로 보고해 네비 이탈 가드에 사용
- `flushDraftRef` — 이탈 직전 700ms 디바운스 드래프트를 즉시 저장하는 콜백 ref (상위 공유 가능)
- `cartCountCache`, `warehouseQueueCountCache`, `deptQueueCountCache` — 탭 전환 remount 사이 카운트 보존용 세션 메모리 캐시
- `HANDOVER_RECEIVE_DEPTS = ["고압", "진공"]` — 인수인계 수신 부서 상수
- `panelStyles.touchScope` — CSS Module로 터치 스코프 스타일 적용(`mobileWarehousePanels.module.css`)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/warehouse/MobileIoComposeWizard.tsx]] — 모바일 입출고 작성 위저드
- [[ERP/frontend/app/mes/_components/mobile/warehouse/MobileDirtyLeaveSheet.tsx]] — 이탈 확인 시트
- [[ERP/frontend/app/mes/_components/_warehouse_sections/WarehouseDraftPanelTabs.tsx]] — 대기열·장바구니 등 탭 패널
- [[ERP/frontend/app/mes/_components/mobile/MobileShell.tsx]] — 이 화면을 마운트하는 셸
