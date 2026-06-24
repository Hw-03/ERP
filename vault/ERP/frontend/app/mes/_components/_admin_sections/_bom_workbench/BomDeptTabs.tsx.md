# BomDeptTabs.tsx

## 이 파일은 뭐예요?
"전체 + 튜브/고압/진공/튜닝/조립/출하" 7개 부서 탭 칩을 렌더하는 컴포넌트. 활성 탭은 해당 부서 색상으로 채워지고, "전체"는 muted2 색상을 쓴다.

## 언제 보나요?
- BOM 관리 화면 상단에서 부서별 필터 동작을 확인하거나 수정할 때
- 탭 순서나 부서 이름 표시를 바꿔야 할 때

## 중요한 내용
- `Props`: `value: BomDeptFilter`, `onChange: (v: BomDeptFilter) => void`
- 탭 목록: `[{ letter: "ALL", name: "전체" }, ...DEPT_LETTERS.map(...)]`
- 각 칩에 `aria-pressed` 적용

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/bomDept.ts]] — `BomDeptFilter`, `DEPT_LETTERS`, `deptColor`
- [[ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/BomWorkbench.tsx]] — `handleDeptChange`로 값 전달
