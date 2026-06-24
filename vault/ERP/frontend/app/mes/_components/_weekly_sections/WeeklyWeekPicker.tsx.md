# WeeklyWeekPicker.tsx

## 이 파일은 뭐예요?
주간보고 화면에서 조회할 주차를 선택하는 드롭다운 캘린더 컴포넌트입니다. 이전/다음 주 화살표 버튼과 월별 캘린더 팝업을 제공하며, 미래 주차 선택은 비활성 처리됩니다.

## 언제 보나요?
- 주간보고 헤더 영역에서 주차 변경이 필요할 때
- 모바일에서는 "5월 3주차" 축약 라벨, 데스크톱에서는 "2026년 5월 3주차 (5/18 ~ 5/24)" 전체 라벨로 표시됨

## 중요한 내용
- `WeeklyWeekPicker` — `weekMon: Date`, `onChange: (d: Date) => void` props
- `getWeekStartMonday(d)` — 임의 날짜에서 해당 주의 월요일 Date 반환 (export)
- `monthlyWeekLabel(weekMon)` — "2026년 5월 3주차 (5/18 ~ 5/24)" 형식 라벨 (export)
- `shortWeekLabel(weekMon)` — "5월 3주차" 모바일 축약 라벨 (export)
- `CAL_MIN = 2026-01-01` — 과거 이동 최소 경계
- 캘린더 팝업은 클릭 영역 외부 mousedown 감지 시 자동 닫힘
- 주 단위 선택: 7개 일자 개별 셀이 아닌 주(week) 전체를 `<button>` 하나로 감싸 클릭 타깃 통합

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/DesktopWeeklyReportView.tsx]] — 이 컴포넌트를 포함하는 주간보고 데스크톱 뷰
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS`
- [[ERP/frontend/lib/mes/colorUtils.ts]] — `tint`
