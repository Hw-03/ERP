# HistoryCalendarPanel.tsx

## 이 파일은 뭐예요?
입출고 내역의 달력 패널 컨테이너입니다. `open=false`이면 null을 반환하고, true이면 `HistoryCalendarStrip`을 카드 안에 렌더하고 하단에 창고/부서/조정 색상 범례를 표시합니다.

## 언제 보나요?
- `HistoryFilterBar`에서 "달력" 버튼을 클릭해 `calendarOpen`이 true일 때

## 중요한 내용
- `export interface HistoryCalendarPanelProps` — `open`, `calendarYear`, `calendarMonth`, `prevMonth/nextMonth`, `setCalendarYear/setCalendarMonth`, `calendarLoading`, `calendarDays`, `calendarDayMap`, `monthlyCountMap`, `todayKey`, `selectedDay`, `setSelectedDay`, `hideWeekends?`
- `hideWeekends` — 모바일 전용; 토/일 제거 후 월~금 5열로 표시. 데스크톱은 미전달(7열)
- 3차 C8: 자체 헤더/토글 제거, 연·월 라벨은 HistoryCalendarStrip 내부로 통합
- 색상 범례: 창고(green) / 부서(cyan) / 조정(yellow)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryCalendarStrip.tsx]] — 실제 달력 그리드 컴포넌트
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryFilterBar.tsx]] — 이 패널을 토글하는 상위 바
