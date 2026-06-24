# historyTableHelpers.tsx

## 이 파일은 뭐예요?
입출고 내역 테이블 전반에서 공유하는 UI 헬퍼 컴포넌트와 로직을 모아놓은 파일입니다. 그룹 빌더(`buildGroups`), 묶음 헤더 행(`BatchHeader`, `OpBatchHeader`), 변동 알약(`MovementSummaryCell`), 메모 셀(`MemoCell`), chevron 버튼, 트랜지션 상수 등이 들어있습니다.

## 언제 보나요?
- `HistoryTable`, `HistoryLogRow`, `BomBatchDetail`, `ReworkBatchHeader` 등 history 내 거의 모든 컴포넌트가 이 파일을 import함

## 중요한 내용
- `HISTORY_CELL_TRANSITION` — 우측 패널 슬라이드 시 padding/width 160ms 부드럽게 따라가는 CSS transition 값
- `export type LogGroup` — `solo | batch | op_batch` discriminated union
- `export function buildGroups(logs: TransactionLog[]): LogGroup[]` — `operation_batch_id` > `reference_no` 우선 순서로 그룹핑
- `export function BatchHeader` — reference_no 기반 레거시 묶음 헤더 행
- `export function OpBatchHeader` — operation_batch_id 기반 묶음 헤더 행; `batch: IoBatch | null` cache hit 여부로 표시 정확도 달라짐
- `export function MovementSummaryCell({ summary })` — 단건/묶음 변동 알약; 1개면 넓은 알약, 2개 이상이면 좁은 알약
- `export function MemoCell({ notes })` — 시스템 자동 노트 제외하고 사용자 메모만 알약으로 노출
- `export function ChevronToggleBtn` — 펼치기/접기 버튼
- `TONE_COLOR` — `MovementTone`별 색상 맵

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/historyBatchInterpreter.ts]] — `describeBatchFlow`, `getHistoryMovementSummary`, `parseTransactionNotes` 로직
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryTable.tsx]] — 이 파일의 핵심 소비자
