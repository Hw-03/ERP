# HistoryBatchDetailPanel.tsx

## 이 파일은 뭐요?
op_batch(묶음) 선택 시 우측에 표시되는 상세 패널입니다. IoBatch를 로드해 번들별 구성 라인을 카드 형태로 나열하고, 개별 라인 클릭 시 해당 품목의 단건 거래 상세로 드릴다운할 수 있습니다. 묶음 전체 취소 PIN 폼도 포함합니다.

## 언제 보나요?
- `HistoryTable`에서 op_batch 헤더 행을 클릭해 `kind="batch"` 선택이 되었을 때
- `DesktopHistoryRightPanel`이 `displaySelection.kind === "batch"` 분기에서 렌더

## 중요한 내용
- `export function HistoryBatchDetailPanel({ batchId, logs, batchCache, setBatchCache, onSelectLog, onBatchCancelled })`
- `HistoryBatchHero` — 묶음 정체 배지 + 변동요약 + 흐름 endpoints + 라인 카운트(총/포함/제외/부족) + 메타
- `BundleBlock` — 번들 헤더 행 + 하위 라인 목록; 라인 클릭은 `logByItemId` 매핑으로 해당 거래 행으로 이동
- `LineStatusBadge` — 포함/부족/제외 상태 인라인 배지
- `HistoryDetailMemo` — `HistoryDetailPanel`에서 re-export된 공유 메모 컴포넌트
- batchCache에 없으면 `ioApi.getBatch` 호출 후 cache에 저장

## 위험도
🔴 높음 — PIN 인증 후 `api.cancelTransaction` 호출로 묶음 전체 취소 가능. 재고에 직접 영향을 줌.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/DesktopHistoryRightPanel.tsx]] — 이 패널을 `kind="batch"`일 때 렌더하는 래퍼
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryDetailPanel.tsx]] — `HistoryDetailMemo` 공유 export 출처
- [[ERP/frontend/app/mes/_components/_history_sections/historyBatchInterpreter.ts]] — `describeBatchFlow`, `getBatchFlowEndpoints`, `getHistoryLineSignedQuantity` 등
