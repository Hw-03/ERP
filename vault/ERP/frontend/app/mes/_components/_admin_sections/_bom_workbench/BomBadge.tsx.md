# BomBadge.tsx

## 이 파일은 뭐예요?
`process_type_code` 를 받아 부서 색상 기반의 작은 배지(예: "HA", "TR")를 렌더하는 단순 표시 컴포넌트. 코드가 null이거나 알 수 없는 부서면 회색 "?" 배지를 표시한다.

## 언제 보나요?
- BOM 리스트·행·모달 어디서든 부서+단계 코드 배지가 표시되어야 할 때
- 배지 색상이나 크기를 조정해야 할 때

## 중요한 내용
- `Props`: `processTypeCode: string | null | undefined`, `small?: boolean`
- `small=true` 이면 10px 폰트·padding 좁힘, 기본은 12px
- 색상: `deptBadgeBg(dept)` 배경 + `deptColor(dept)` 글자

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/bomDept.ts]] — `deptOf`, `deptBadgeBg`, `deptColor`
