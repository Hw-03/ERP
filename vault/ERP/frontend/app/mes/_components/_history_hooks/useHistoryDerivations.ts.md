# useHistoryDerivations.ts

## 이 파일은 뭐예요?
모바일 HistoryScreen에서 거래 로그(`TransactionLog[]`)를 받아 필터 적용, 날짜별 그룹, 캘린더 셀 배열, 요약(건수/입고합/출고합) 등 화면에 필요한 모든 파생값을 `useMemo` 체인으로 계산해 반환하는 커스텀 훅.

## 언제 보나요?
- 모바일 입출고 내역(History) 화면의 필터·캘린더·리스트 로직을 추적할 때
- `filteredLogs`, `groupedByDay`, `summary`, `calendarDays` 계산 방식을 확인할 때
- 날짜 파싱(`parseUtc`, `toDateKey`) 또는 기간 필터(`TODAY`/`WEEK`/`MONTH`) 동작을 확인할 때

## 중요한 내용
- **`useHistoryDerivations(logs, filters, items, calendarLogs, calendarYear, calendarMonth, productModels)`** — 메인 훅. 8가지 파생값을 하나의 결과 객체(`UseHistoryDerivationsResult`)로 반환.
- **`HistoryFilters`** — `{ date, type, employee, model, search }` 필터 인터페이스.
- **`HistorySummary`** — `{ total, inSum, outSum }`. `inSum`은 RECEIVE+PRODUCE, `outSum`은 SHIP+BACKFLUSH 수량 합산.
- **`itemModelMap`** — `item_id → 모델명` 맵. `productModels`의 `slot`을 경유해 품목별 모델명을 해결.
- **`groupedByDay`** — 필터된 로그를 날짜 키(`YYYY-MM-DD`)로 묶어 최신순 정렬한 배열.
- **`calendarDayMap`** — 캘린더 전용 로그를 날짜 키로 묶은 맵(필터 적용 없음).
- **`calendarDays`** — 해당 월의 달력 셀 배열(`null`=빈 칸, `number`=일).
- **`parseEmployeeName`** / **`parseUtc`** / **`toDateKey`** — 순수 유틸 함수로 외부 export됨.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_hooks/📁__history_hooks]] — 이 훅이 속한 폴더 개요
- [[ERP/frontend/lib/api.ts]] — `TransactionLog`, `Item`, `ProductModel`, `TransactionType` 타입 출처
