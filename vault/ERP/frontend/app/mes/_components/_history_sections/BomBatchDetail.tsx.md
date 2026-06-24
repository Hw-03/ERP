# BomBatchDetail.tsx

## 이 파일은 뭐예요?
입출고 내역 테이블에서 op_batch 행이 펼쳐질 때 나타나는 "BOM 구성 라인" 서브 행 목록을 그립니다. 배치 ID로 `ioApi.getBatch`를 호출하고, 부모(BOM 상위 품목)와 자식(자동차감 부품들)을 구별해 계층 행으로 렌더합니다.

## 언제 보나요?
- `HistoryTable`에서 `op_batch` 그룹의 chevron을 클릭해 펼칠 때
- BOM 묶음 배치의 각 번들과 하위 라인을 확인하고 싶을 때

## 중요한 내용
- `export function BomBatchDetail({ batchId, colSpan, cache, onCached, compact }: Props)` — 부모가 캐시(`Map<string, IoBatch>`)를 관리해 중복 API 요청을 차단
- `BundleRows` — 번들 헤더 행 렌더; `isBomParent` 여부에 따라 BOM/단품 칩을 구분
- `BomLineRow` — 자동차감(BACKFLUSH) 자식 라인 한 행; `included/shortage` 상태를 `StatusBadge`로 표시
- `SIGN_TONE_HEX` — `LineSignTone`별 색상 매핑 (blue/red/cyan/muted)
- `isSingleLineDirect` 로직 — BOM이 아닌 단품 단일 라인이면 펼침 비활성화

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/historyBatchInterpreter.ts]] — `getHistoryBomParentLine`, `getHistoryLineSignedQuantity`, `getHistoryLineStatusLabel` 로직
- [[ERP/frontend/app/mes/_components/_history_sections/historyTableHelpers.tsx]] — `HISTORY_CELL_TRANSITION` 상수
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryTable.tsx]] — 이 컴포넌트를 렌더하는 부모
