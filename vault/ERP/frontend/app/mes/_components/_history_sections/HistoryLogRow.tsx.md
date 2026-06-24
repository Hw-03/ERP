# HistoryLogRow.tsx

## 이 파일은 뭐예요?
입출고 내역 테이블의 단건(낱개) 거래 행을 렌더합니다. 거래 타입별 아이콘·색상, 품목명, 수량 변동 알약, 담당자, 메모 셀을 6컬럼으로 구성하며, 클릭 시 우측 상세 패널을 엽니다.

## 언제 보나요?
- `HistoryTable`에서 `solo` 타입 LogGroup을 렌더할 때
- `batch` 타입 묶음이 펼쳐졌을 때 하위 행으로 재사용

## 중요한 내용
- `export const HistoryLogRow = memo(HistoryLogRowImpl)` — `React.memo`로 감싸 불필요한 리렌더 방지
- `TX_ICON` — 15가지 거래 타입별 lucide 아이콘 맵
- `isReworkOperation(log)` — 재작업(DISASSEMBLE)이면 빨강 강제
- `producer` — `requester_name` 우선, 없으면 `produced_by`에서 괄호 앞 이름 파싱
- `edit_count > 0` — 노란 "수정됨" 배지 표시
- `compact` prop — 우측 패널 열림 시 일시/구분 셀 좌우 패딩 축소

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryTable.tsx]] — 이 컴포넌트를 렌더하는 부모
- [[ERP/frontend/app/mes/_components/_history_sections/historyBatchInterpreter.ts]] — `getHistoryDisplayLabel`, `getSingleLogMovement`
- [[ERP/frontend/app/mes/_components/_history_sections/historyTableHelpers.tsx]] — `HISTORY_CELL_TRANSITION`, `MemoCell`, `MovementSummaryCell`
- [[ERP/frontend/app/mes/_components/_history_sections/transactionTaxonomy.ts]] — `isReworkOperation`
