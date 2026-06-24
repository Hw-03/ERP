# DesktopDefectView.tsx

## 이 파일은 뭐예요?
데스크톱 불량 탭의 최상위 컨테이너입니다. 허브(작업 선택) → 목록(격리 현황) → 작업 흐름(새 격리 추가 / 즉시 폐기 / 처리) 세 화면을 `ViewMode` 상태로 전환합니다.

## 언제 보나요?
- 데스크톱 사이드바에서 "불량" 탭을 선택했을 때
- URL에 `?tab=defect` 또는 `?defect_dept=<부서>` 가 있을 때

## 중요한 내용
- **props**: `operator`, `defectDeptFilter?: string | null`, `onStatusChange?`
- `canEnterIO(operator)` 실패 시 `WarehouseAccessDenied` 표시
- **ViewMode** 4종: `hub` → `list` → `cart(add|scrap)` → `process`
- `window.history.pushState/popState` 로 브라우저 뒤로가기 연동 (뒤로가기 = 이전 화면)
- KPI는 서버 `/kpi` 대신 클라이언트에서 `scopedLocations`를 집계해 계산
- 스코프 필터: `my`(내 부서) / `production`(생산 전체) / `all`(전체)
- 창고 담당자(`isWarehouseStaff`)면 기본 스코프를 `all`로 시작
- `reloadNonce` 증가로 처리 완료 후 목록 새로고침

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_defect_hub/DefectCartFlow.tsx]] — 새 격리·즉시 폐기 작업 화면
- [[ERP/frontend/app/mes/_components/_defect_hub/DefectProcessPanel.tsx]] — 기존 불량 처리 화면
- [[ERP/frontend/app/mes/_components/_warehouse_steps/📁__warehouse_steps]] — `canEnterIO`, `isWarehouseStaff`, `isDepartmentApprover`
- [[ERP/frontend/lib/api/defects]] — `defectsApi.listDefects()`
