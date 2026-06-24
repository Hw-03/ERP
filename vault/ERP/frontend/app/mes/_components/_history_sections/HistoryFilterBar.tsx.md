# HistoryFilterBar.tsx

## 이 파일은 뭐예요?
입출고 내역 화면 상단 컨트롤 한 줄(검색창, 선택 날짜 칩, 기간 세그먼트, 필터 토글 버튼, 달력 토글 버튼)을 렌더합니다. 3차 C8 개편으로 한 줄에 4개 컨트롤이 통합된 형태입니다.

## 언제 보나요?
- 입출고 내역 화면(`HistoryView`) 상단 항상 노출
- 필터 패널과 달력 패널을 여닫는 진입점

## 중요한 내용
- `export function HistoryFilterBar({ search, setSearch, dateFilter, setDateFilter, filterPanelOpen, onToggleFilterPanel, activeFilterCount, calendarOpen, onToggleCalendar, selectedDay, onClearSelectedDay })` — props 11개
- `activeFilterCount` — 필터 버튼 배지용 (부서+모델+거래종류 선택 합산)
- `selectedDay` — 달력에서 고른 날짜(YYYY-MM-DD); 선택 시 파란 알약 칩으로 표시
- `DATE_OPTIONS` — "전체/오늘/이번주/이번달" 세그먼트 소스(`historyQuery.ts`)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/historyQuery.ts]] — `DATE_OPTIONS` 상수
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryFilterPanel.tsx]] — 이 바 아래에 드롭되는 필터 패널
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryCalendarPanel.tsx]] — 달력 패널
