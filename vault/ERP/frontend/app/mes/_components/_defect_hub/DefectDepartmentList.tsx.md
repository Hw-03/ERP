# DefectDepartmentList.tsx

## 이 파일은 뭐예요?
격리된 불량 항목을 부서별로 그룹핑해 접기/펼치기 가능한 목록으로 렌더링하는 컴포넌트다. 각 행에 [처리] 버튼이 있어 상위로 `onProcess` 콜백을 전달한다.

## 언제 보나요?
- 불량 탭 "격리 목록" 뷰에서 `filteredLocations`를 이 컴포넌트에 주입할 때
- 데스크톱 불량 뷰와 `DefectHubPanel` 모두에서 사용

## 중요한 내용
- 부서별 그룹핑: `groupByDepartment()` 내부 함수 → `Record<string, DefectLocation[]>`
- `priorityDept` prop: 이 부서를 목록 최상단에 표시 (전체 보기 시 내 부서 우선)
- 부서 헤더: `getDepartmentFallbackColor(dept)` 기반 색상 배지, 클릭으로 접기/펼치기
- 1년 초과 경고: `isOverOneYear(defective_at)` → `AlertTriangle + "1년 초과"` 배지 표시
- Pydantic Decimal → JSON 문자열 직렬화 주의: `Number(loc.quantity)` 변환 필수 (주석 명시)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_defect_hub/DefectHubPanel.tsx]] — onProcess 수신해 처리 화면 전환
- [[ERP/frontend/lib/api/types/defects.ts]] — `DefectLocation` 타입
- [[ERP/frontend/lib/mes/color.ts]] — `getDepartmentFallbackColor`
