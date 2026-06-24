# HistoryTable.tsx

## 이 파일은 뭐예요?
입출고 내역의 핵심 테이블 컴포넌트입니다. `filteredLogs`를 solo/op_batch/batch 세 그룹 유형으로 분류하고, 각각 단건 행·BOM 묶음·재작업 묶음으로 렌더합니다. IntersectionObserver 기반 lazy fetch와 동시성 큐(최대 4개)로 op_batch의 `IoBatch` 데이터를 미리 로드합니다.

## 언제 보나요?
- 입출고 내역 화면의 메인 테이블 영역
- 필터·검색 결과가 바뀔 때마다 갱신

## 중요한 내용
- `export function HistoryTable({ loading, filteredLogs, totalCount, selection, onSelectLog, onSelectBatch, batchCache, setBatchCache, canLoadMore, loadingMore, onLoadMore })`
- `buildGroups(filteredLogs)` — `operation_batch_id` → `op_batch`, `reference_no` → `batch`, 나머지 → `solo`
- `VISIBLE_FETCH_CONCURRENCY = 4` — 동시 IoBatch fetch 상한
- `COLUMNS_DEFAULT` / `COLUMNS_COMPACT` — 우측 패널 열림 여부에 따라 컬럼 폭 전환
- 선택 변화 시 자동 expand/collapse — `prevSelectedBatchRef`로 이전 배치 접기
- "100건 더보기" 버튼으로 페이지 단위 추가 로드

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/historyTableHelpers.tsx]] — `buildGroups`, `BatchHeader`, `OpBatchHeader`
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryLogRow.tsx]] — solo 행
- [[ERP/frontend/app/mes/_components/_history_sections/BomBatchDetail.tsx]] — op_batch 펼침 서브 행
- [[ERP/frontend/app/mes/_components/_history_sections/ReworkBatchHeader.tsx]] — 재작업 헤더 행
- [[ERP/frontend/app/mes/_components/_history_sections/ReworkBatchDetail.tsx]] — 재작업 서브 행
- [[ERP/frontend/app/mes/_components/_history_sections/historyConstants.ts]] — `HistorySelection` 타입
