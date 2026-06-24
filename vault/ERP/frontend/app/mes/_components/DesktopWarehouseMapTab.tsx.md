# DesktopWarehouseMapTab.tsx

## 이 파일은 뭐예요?
창고 지도 탭의 진입 컨테이너입니다. 일반 직원에게는 읽기 전용 지도만, 창고 정/부 관리자(`warehouse_role = primary|deputy`)에게는 PIN 확인 후 편집 모드를 추가로 제공합니다.

## 언제 보나요?
- 데스크톱 사이드바에서 "창고 지도" 탭을 선택했을 때

## 중요한 내용
- **편집 모드 진입 흐름**: 편집 모드 버튼 클릭 → PIN 입력 → `employeesApi.verifyEmployeePin` → 성공 시 `credsRef.current`에 자격증명 저장 → `registerOperatorCredsProvider`로 API 자격증명 주입 (stale 클로저 방지용 ref 패턴)
- **편집 탭 2개**: "박스 관리"(`DesktopWarehouseMapView editable`) / "앵글 편집"(`AdminWarehouseStructureSection`)
- **불일치 경고 배너**: `warehouseMapApi.reconcile()` 결과로 박스 합 ≠ 창고 재고인 품목 건수 표시 → 박스 관리 탭으로 이동 유도
- 편집 모드 종료 시 `credsRef.current = null` 로 자격증명 폐기

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/DesktopWarehouseMapView.tsx]] — 실제 창고 지도 렌더 (읽기·편집 공용)
- [[ERP/frontend/app/mes/_components/_admin_sections/AdminWarehouseStructureSection.tsx]] — 앵글 골조 편집
- [[ERP/frontend/lib/api/warehouse-map]] — `warehouseMapApi.reconcile()` (불일치 대조)
- [[ERP/frontend/lib/api-core.ts]] — `registerOperatorCredsProvider` (API 헤더 자격증명 주입)
