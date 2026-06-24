# DesktopHistoryView.tsx

## 이 파일은 뭐예요?
데스크톱 입출고 내역 탭의 최상위 컨테이너입니다. 필터 패널, 달력, 통계 바, 거래 테이블(좌측)과 상세 패널(우측) 2-column 구조로 이루어집니다.

## 언제 보나요?
- 데스크톱 사이드바에서 "입출고 내역" 탭을 선택했을 때

## 중요한 내용
- **상태 구조**
  - `filterPanelOpen` — 부서·모델·거래종류 다중 선택 패널 접힘/펼침
  - `calendarOpen` — 달력 패널. 펼쳐진 경우에만 그 달 전체 거래 fetch
  - `dateFilter` — 기간 칩 ("MONTH", "WEEK" 등), `selectedDay` — 달력 날짜 단일 선택
  - `selection / selectionStack` — 우측 패널 드릴다운 뒤로가기 스택
  - `batchCache` — 배치 상세 lazy fetch 공유 캐시 (테이블↔우측 패널)
- **summary / baselineSummary** 이중 집계: `summary`는 현재 필터 기준 X건, `baselineSummary`는 기간만 기준 Y건 (분자/분모)
- `navigateToLog` — 다른 날짜 로그로 이동 시 `selectedDay` 변경 + `pendingScrollLogIdRef`로 로드 완료 후 스크롤
- `useToggleSet` — 다중 선택 필터(부서·모델·거래종류) 상태 관리 훅

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryTable.tsx]] — 거래 목록 테이블
- [[ERP/frontend/app/mes/_components/_history_sections/DesktopHistoryRightPanel.tsx]] — 우측 상세 패널
- [[ERP/frontend/app/mes/_components/_hooks/useHistoryData.ts]] — 거래 목록 페이지네이션 훅
- [[ERP/frontend/lib/queries/useTransactionsQuery.ts]] — `useMonthlyCountsQuery` (달력 연간 집계)
