# BomUnmatchedRawsDrawer.tsx

## 이 파일은 뭐예요?
BOM 편집 화면 하단의 접이식 패널. 현재 부서의 원자재(R 단계) 중 어떤 BOM의 자식으로도 등록되지 않은 항목(미배치 원자재)을 집계해 빨간 카운트 또는 초록 "전부 매칭됨"으로 빠르게 확인할 수 있게 한다.

## 언제 보나요?
- 원자재가 어떤 BOM에도 연결되지 않았는지 점검할 때
- BOM 구성 완료 전 미배치 품목 목록을 확인할 때

## 중요한 내용
- `Props`: `rawItems: Item[]` (부서 R 단계 전체), `childIdSet: Set<string>` (등록된 자식 item_id)
- `unmatched`: `rawItems.filter(i => !childIdSet.has(i.item_id))`
- 기본 상태: 접힘(`open: false`). 미배치 없으면 목록 렌더 생략
- 편집 모드에서만 BomWorkbench가 렌더함 (`mode === "edit"`)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/_bom_workbench/BomWorkbench.tsx]] — `rawItems`, `childIdSet` 계산 후 전달
