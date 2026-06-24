# useHistoryData.ts

## 이 파일은 뭐예요?
입출고 내역 화면의 서버사이드 필터 + 페이지네이션 조회를 담당하는 훅입니다. 필터 조건(작업 종류/날짜/검색어/부서/모델)이 바뀌면 목록을 초기화하고 재조회하며, "더 보기" 버튼으로 다음 페이지를 추가로 불러옵니다.

## 언제 보나요?
- 입출고 내역 목록이 필터 변경 후 제대로 갱신되지 않을 때
- "더 보기" 중 필터를 바꿨을 때 stale 데이터가 붙는 문제를 확인할 때
- 날짜 필터와 달력 선택이 충돌하는 동작을 파악할 때

## 중요한 내용
- `UseHistoryDataArgs`: `operations`, `dateFilter`, `debouncedSearch`, `selectedDateKey`, `department`, `model`
- `UseHistoryDataResult`: `logs`, `setLogs`, `loading`, `loadingMore`, `canLoadMore`, `loadMore`
- `queryKey` 문자열로 stale 응답 가드: 새 fetch 응답이 현재 조건과 다르면 무시
- `selectedDateKey`가 있으면 `dateFilter`를 무시하고 해당 날짜만 조회
- `loadMore` 도중 조건 변경 시 `AbortController`로 진행 중 요청 취소
- `HISTORY_PAGE_SIZE` 상수: `_history_sections/historyConstants`에서 가져옴

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/historyConstants.ts]] — 페이지 크기 상수
- [[ERP/frontend/app/mes/_components/_history_sections/historyQuery.ts]] — dateFilterToFrom 변환 함수
- [[ERP/frontend/lib/api.ts]] — api.getTransactions 호출
