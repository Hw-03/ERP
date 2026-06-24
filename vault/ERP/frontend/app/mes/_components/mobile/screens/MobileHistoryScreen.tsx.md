# MobileHistoryScreen.tsx

## 이 파일은 뭐예요?
모바일 입출고 내역 탭 화면. 데스크톱 `DesktopHistoryView`의 상태·훅 오케스트레이션을 그대로 따르되, 넓은 테이블 대신 카드 리스트(`MobileHistoryList`)를 사용하고 거래 상세를 드래그 `BottomSheet`로 보여준다. 달력 패널, 필터 패널, 통계 바도 포함한다.

## 언제 보나요?
- 모바일 하단 탭바 "내역" 탭을 누를 때
- `MobileShell`이 `activeTab === "history"`일 때 렌더

## 중요한 내용
- `MobileHistoryScreen()` — 기본 export, props 없음
- `SEARCH_DEBOUNCE_MS = 350` — 검색 디바운스 간격
- `HistorySelection` — `{ kind: "log", log }` 또는 `{ kind: "batch", batchId, logs }` 유니온 타입
- `selectionStack` — 드릴다운(BOM 하위·최근거래) 뒤로가기 스택; 브라우저 `popstate` 이벤트도 처리
- 달력 뷰: 월별 거래 건수를 `/monthly-counts?year=YYYY`로 조회 (`useMonthlyCountsQuery`)
- 요약 통계: `productionApi.getTransactionsSummary`로 현재 필터 요약 + 베이스라인 별도 조회
- `MobileHistoryList` — 카드형 목록(이 파일과 같은 mobile 폴더의 history/ 하위)
- 상세 시트 제목은 단건이면 `item_name`, 묶음이면 `item_name 외 N건`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_hooks/useHistoryData.ts]] — 거래 내역 무한스크롤 로드 훅
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryDetailPanel.tsx]] — 단건 상세
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryBatchDetailPanel.tsx]] — 묶음 상세
- [[ERP/frontend/app/mes/_components/mobile/history/MobileHistoryList.tsx]] — 카드형 목록
- [[ERP/frontend/app/mes/_components/mobile/MobileShell.tsx]] — 이 화면을 마운트하는 셸
