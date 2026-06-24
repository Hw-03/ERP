# BomParentHeader.tsx

## 이 파일은 뭐예요?
BomDeptTabs 옆에 가로로 배치되는 "선택된 부모 품목" 헤더 카드. 배지·이름·코드·자식 수를 표시하고, 편집 모드에서는 완료 상태 칩과 "검토·완료" 버튼을 함께 보여준다.

## 언제 보나요?
- 부모 품목 헤더의 상태 칩(완료/작업중/미착수) 표시가 잘못될 때
- "검토·완료" 버튼의 활성/비활성 조건을 수정할 때 (자식 0개 + 미완료이면 disabled)

## 중요한 내용
- `Props`: `parent: Item | null`, `mode: "edit" | "whereused"`, `childCount`, `isCompleted`, `onOpenReview`
- 카드 테두리: 부서 accent 색 35% 혼합
- "검토·완료" 버튼: `childCount === 0 && !isCompleted` 이면 disabled

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/BomWorkbench.tsx]] — `setReviewOpen`으로 모달 오픈
- [[ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/bomDept.ts]] — `BOM_STATUS_META`, `deptColor`, `deptOf`
