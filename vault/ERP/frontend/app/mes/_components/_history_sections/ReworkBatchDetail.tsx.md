# ReworkBatchDetail.tsx

## 이 파일은 뭐예요?
재작업(DISASSEMBLE) 배치 행이 펼쳐질 때 나타나는 서브 행 목록입니다. 부모 품목의 BOM 트리를 `catalogApi.getBOMTree`로 가져와서 각 자식 노드마다 회수(RECEIVE)/폐기(DEFECT_SCRAP) 거래 결과를 매핑해 계층 구조로 보여줍니다.

## 언제 보나요?
- `HistoryTable`에서 `defect-disassemble:` 접두사 reference_no 묶음의 chevron을 펼칠 때

## 중요한 내용
- `export function ReworkBatchDetail({ logs, parentItemId, colSpan, compact }: Props)` — `logs`는 DISASSEMBLE 제외한 자식 거래들
- `NodeRows` — BOM 트리 노드 재귀 렌더; matched 거래가 없는 노드는 "처리 결정 안 된 항목"으로 표시
- `FlatLogRow` — BOM 트리가 없을 때(bomChildren.length === 0) 사용하는 단순 행
- 회수는 초록(+), 폐기는 빨강 색상으로 구분

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryTable.tsx]] — 이 컴포넌트를 렌더하는 부모
- [[ERP/frontend/app/mes/_components/_history_sections/ReworkBatchHeader.tsx]] — 재작업 헤더 행
- [[ERP/frontend/app/mes/_components/_history_sections/historyTableHelpers.tsx]] — `HISTORY_CELL_TRANSITION`
