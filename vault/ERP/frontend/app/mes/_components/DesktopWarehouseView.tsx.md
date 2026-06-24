# DesktopWarehouseView.tsx

## 이 파일은 뭐예요?
데스크톱 입출고 탭의 최상위 컨테이너입니다. 입출고 작성(IoComposeView)과 장바구니·내 요청·창고 승인 대기·부서 결재 대기·인수인계 섹션 탭을 통합 관리합니다.

## 언제 보나요?
- 데스크톱 사이드바에서 "입출고" 탭을 선택했을 때, 또는 대시보드에서 품목 클릭으로 이동할 때

## 중요한 내용
- **props**: `globalSearch`, `onStatusChange`, `preselectedItem` (품목 미리 선택), `entryIntent` (입고/출고 의도), `onSubmitSuccess`
- **섹션 탭**: `compose`, `cart`, `mine`, `queue`(창고 관리자), `dept-queue`(부서 결재자), `handover`(튜브/고압/진공)
  - URL `?section=` 쿼리로 초기 섹션 결정, 권한 없으면 `compose`로 폴백
- **배지 카운트 캐시**: `cartCountCache`, `warehouseQueueCountCache`, `deptQueueCountCache` — 모듈 레벨 메모리 캐시로 탭 전환 시 이전 카운트 보존(새로고침 시 휘발)
- `panelRefreshNonce` — 제출 성공·취소 후 섹션 패널 새로고침 트리거
- `restoreIoDraft / restoreNonce` — 장바구니에서 "이어서 하기" 클릭 시 IoComposeView 복원
- 인수인계 수신 권한: `HANDOVER_RECEIVE_DEPTS = ["고압", "진공"]` 소속만

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — 입출고 작성 위저드
- [[ERP/frontend/app/mes/_components/_warehouse_sections/WarehouseDraftPanelTabs.tsx]] — 섹션별 패널 렌더
- [[ERP/frontend/app/mes/_components/_warehouse_steps/📁__warehouse_steps]] — `canEnterIO`, `isDepartmentApprover`
