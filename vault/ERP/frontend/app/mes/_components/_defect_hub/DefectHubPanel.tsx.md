# DefectHubPanel.tsx

## 이 파일은 뭐예요?
모바일 불량 탭의 중앙 상태 관리 컴포넌트다. 허브(카드 선택) → 목록 → 처리 / 카트 4개 뷰 상태를 관리하고, KPI + 격리 목록을 백엔드에서 로드해 `DefectDepartmentList`에 주입한다.

## 언제 보나요?
- 모바일 불량 탭(`MobileDefectScreen`)이 이 패널을 마운트할 때
- 데스크톱 불량 뷰는 동등한 역할을 `DesktopDefectView`가 담당

## 중요한 내용
- `view` 상태: `"hub" | "list" | "process" | "cart"`
- `reloadNonce`: 처리 완료 후 증가 → KPI + 목록 재로드 트리거
- `filteredLocations`: scope(my/all/production) + KPI 필터 + 정렬 순서를 `useMemo`로 계산
- process 뷰: `MobileDefectProcessPanel` (전폭, 모달 아님)
- cart 뷰: `MobileDefectCartFlow` (다품목 격리/폐기)
- `popstate` 리스너: 브라우저 뒤로가기 시 cart→hub, process→list, list→hub 순으로 한 단계씩 복귀
- `DefectHubEmployee` 인터페이스: 이 패널이 요구하는 최소 직원 필드

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_defect_hub/DefectDepartmentList.tsx]] — 부서별 격리 목록
- [[ERP/frontend/app/mes/_components/_defect_hub/DefectKpiCards.tsx]] — KPI 카드
- [[ERP/frontend/app/mes/_components/_defect_hub/DefectFilterBar.tsx]] — 범위/정렬 필터
- [[ERP/frontend/app/mes/_components/mobile/screens/MobileDefectProcessPanel.tsx]] — process 뷰
- [[ERP/frontend/app/mes/_components/mobile/screens/MobileDefectCartFlow.tsx]] — cart 뷰
- [[ERP/frontend/lib/api/defects]] — getDefectKpi, listDefects API
