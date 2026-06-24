# useTransactions.ts

## 이 파일은 뭐예요?
모바일 입출고 내역 목록을 페이지 단위(100건)로 가져오는 훅과, 특정 연월의 로그를 클라이언트 사이드 필터로 추출하는 유틸 함수를 제공하는 파일입니다. AbortController로 빠른 refetch 충돌을 방지합니다.

## 언제 보나요?
- 모바일 HistoryScreen에서 거래 내역 목록과 무한 스크롤이 필요할 때
- 캘린더 뷰에서 특정 월의 로그만 골라야 할 때 (`fetchMonthLogs` 재사용)

## 중요한 내용
- `useTransactions()` — `{ logs, loading, error, hasMore, refetch, loadMore }` 반환
  - `refetch` — 처음부터 100건 다시 로드, 이전 요청 abort
  - `loadMore` — 다음 페이지(100건 단위) append, 이전 inflight abort 후 새 요청
  - `activeCtrlRef` — unmount 시 cleanup에서도 abort 가능하도록 ref로 관리
- `fetchMonthLogs(year, month)` — **named export** (비훅 함수). 백엔드에 월 범위 필터가 없어 2000건을 받아 클라이언트에서 연월 필터링
  - `useMobileHistoryAux.ts`에서 import해서 사용

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api.ts]] — `api.getTransactions`, `TransactionLog` 타입
- [[ERP/frontend/app/mes/_components/mobile/hooks/useMobileHistoryAux.ts]] — `fetchMonthLogs` 를 import해서 캘린더 뷰에 사용
