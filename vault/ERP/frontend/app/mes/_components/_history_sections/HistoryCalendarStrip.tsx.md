# HistoryCalendarStrip.tsx

## 이 파일은 뭐예요?
입출고 내역 달력의 실제 그리드 컴포넌트입니다. 월 뷰(날짜 그리드)와 연 뷰(12개월 카드)를 전환하는 iOS 캘린더 스타일 UI를 구현하며, 날짜 클릭 시 해당 날의 거래 목록 필터가 적용됩니다.

## 언제 보나요?
- `HistoryCalendarPanel`이 열릴 때 내부에 렌더
- 날짜별 거래 건수(창고/부서/조정)를 한눈에 파악할 때

## 중요한 내용
- `export function HistoryCalendarStrip(...)` — props: calendarYear/Month, prevMonth/nextMonth, setCalendarYear/setCalendarMonth, calendarLoading, calendarDays, calendarDayMap, monthlyCountMap, todayKey, selectedDay, setSelectedDay, hideWeekends
- `viewMode` — `"month" | "year"` 로컬 상태; 월 헤더 클릭으로 연 뷰 전환
- `buildWeekdayCells` — hideWeekends=true일 때 7열 배열에서 토/일 제거 후 월요일 시작 오프셋 재계산
- 연 뷰: 12개월 거래 건수 비례로 파란 배경 농도 변화
- 날짜 셀: 같은 날 재클릭하면 선택 해제, 창고/부서/조정 건수 색상별로 표시

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryCalendarPanel.tsx]] — 이 컴포넌트를 렌더하는 래퍼
- [[ERP/frontend/app/mes/_components/_history_sections/transactionTaxonomy.ts]] — `isWarehouseInvolvedType`, `isDepartmentInternalType`, `isAdjustmentLike`
