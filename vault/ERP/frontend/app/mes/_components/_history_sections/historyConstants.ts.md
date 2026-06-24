# historyConstants.ts

## 이 파일은 뭐예요?
입출고 내역 화면 전반의 공통 상수와 타입을 정의합니다. 우측 상세 패널의 선택 상태 union 타입과 페이지 크기 상수가 들어있습니다.

## 언제 보나요?
- `HistoryTable`, `DesktopHistoryRightPanel` 등 선택 상태를 전달·판별하는 모든 컴포넌트

## 중요한 내용
- `export type HistorySelection = { kind: "log"; log: TransactionLog } | { kind: "batch"; batchId: string; logs: TransactionLog[] }` — 단건 선택과 묶음 선택을 구분하는 discriminated union
- `export const HISTORY_PAGE_SIZE = 100` — 한 번에 로드하는 거래 건수

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/DesktopHistoryRightPanel.tsx]] — HistorySelection으로 패널 분기
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryTable.tsx]] — HISTORY_PAGE_SIZE 미사용(부모에서 전달), HistorySelection 소비
