# MobileDefectScreen.tsx

## 이 파일은 뭐예요?
모바일 불량 탭 화면. `canEnterIO` 권한 확인 후 `DefectHubPanel`을 세로 전체 스크롤 레이아웃으로 렌더한다. 권한이 없으면 `WarehouseAccessDenied`, 로그인이 없으면 안내 문구를 보여준다.

## 언제 보나요?
- 모바일 하단 탭바 "불량" 탭을 누를 때
- `MobileShell`이 `activeTab === "defect"`일 때 렌더

## 중요한 내용
- `MobileDefectScreen({ defectDeptFilter })` — 권한 게이트 + 내부 분기 컴포넌트
- `MobileDefectInner` — 권한 통과 후 `useWarehouseData`로 품목·모델 로드, `DefectHubPanel` 마운트
- `defaultSource` — `isWarehouseStaff && !isDepartmentApprover`이면 `"warehouse"`, 그 외 `"production"`
- 데스크톱 `DefectView`와 동일한 `DefectHubPanel`을 재사용(세로형 레이아웃은 이미 모바일 친화적)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_defect_hub/DefectHubPanel.tsx]] — 실제 불량 허브 UI
- [[ERP/frontend/app/mes/_components/_warehouse_steps/📁__warehouse_steps]] — `canEnterIO`, `isWarehouseStaff`, `isDepartmentApprover` 권한 함수
- [[ERP/frontend/app/mes/_components/mobile/MobileShell.tsx]] — 이 화면을 마운트하는 셸
