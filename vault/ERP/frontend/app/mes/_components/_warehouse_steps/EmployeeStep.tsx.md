# EmployeeStep.tsx

## 이 파일은 뭐예요?
입출고 위저드에서 작업 담당자를 선택하는 스텝 컴포넌트입니다. 직원 목록을 부서별 색상과 아바타로 5열 그리드로 표시하며, 10명 초과 시 "추가 N명" 버튼으로 펼칩니다.

## 언제 보나요?
- 입출고(IO) 위저드에서 "담당자 선택" 단계를 렌더링할 때
- 직원이 10명 초과일 때 더보기 토글 동작을 확인할 때

## 중요한 내용
- `EmployeeStep` — named export 함수 컴포넌트
- props: `employees: Employee[]`, `selectedId: string`, `onSelect: (id: string) => void`, `expanded: boolean`, `setExpanded: (e: boolean) => void`
- `useDeptColorLookup()` — `DepartmentsContext`에서 부서별 색상 토큰 조회
- `firstEmployeeLetter(name)` — 이름 첫 글자를 아바타에 표시
- `normalizeDepartment(dept)` — 부서명을 화면용 레이블로 변환
- 선택된 직원은 부서 색상 배경 + 2px 테두리로 강조 표시

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/DepartmentsContext.tsx]] — `useDeptColorLookup` 훅 제공
- [[ERP/frontend/lib/mes/employee.ts]] — `firstEmployeeLetter` 유틸
- [[ERP/frontend/lib/mes/department.ts]] — `normalizeDepartment` 유틸
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 토큰
