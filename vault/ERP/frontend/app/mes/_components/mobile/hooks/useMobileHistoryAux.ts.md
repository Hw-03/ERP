# useMobileHistoryAux.ts

## 이 파일은 뭐예요?
모바일 HistoryScreen의 보조 데이터(필터 옵션용 품목 목록, 제품 모델 목록, 캘린더 뷰 전용 월별 로그)를 한 곳에서 fetch하는 훅입니다. R8-3 단계에서 HistoryScreen의 흩어진 2개 state/effect를 이 훅으로 추출했습니다.

## 언제 보나요?
- 모바일 입출고 내역(HistoryScreen)에서 필터 모달의 품목·모델 목록이 필요할 때
- 뷰 모드를 `"calendar"`로 전환하거나 연도/월을 바꿀 때 해당 월 로그를 가져올 때

## 중요한 내용
- `UseMobileHistoryAuxOptions`: `{ viewMode: "list" | "calendar", calendarYear, calendarMonth }`
- `UseMobileHistoryAuxResult`: `{ items, productModels, calendarLogs, calendarLoading }`
- `items` — mount 시 최대 2000건 1회 fetch (필터 드롭다운 전용)
- `productModels` — `useModelsQuery()` React Query 캐시 공유 (R2-3)
- `calendarLogs` — `viewMode === "calendar"` 일 때만 `fetchMonthLogs(year, month)` 호출
- 메인 거래 로그 fetch는 이 훅에서 담당하지 않음 — `useTransactions` 가 담당

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/hooks/useTransactions.ts]] — `fetchMonthLogs` 를 여기서 import
- [[ERP/frontend/lib/queries/useModelsQuery.ts]] — 제품 모델 React Query 훅
- [[ERP/frontend/lib/api.ts]] — `api.getItems`, `Item`, `ProductModel`, `TransactionLog` 타입
