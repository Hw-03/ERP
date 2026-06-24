# WeeklyGroupCards.tsx

## 이 파일은 뭐예요?
주간보고에서 공정(튜브/고압/진공/튜닝/조립/출하) 6개를 세로 카드 목록으로 나열하고, 클릭 시 해당 공정의 상세 테이블을 표시하도록 선택 상태를 외부에 전달하는 내비게이션 카드 컴포넌트입니다.

## 언제 보나요?
- 주간보고 화면 좌측 패널에 항상 표시됨
- 카드 클릭 시 `onSelect(process_code)` 호출 → `WeeklyDetailTable`이 우측에 갱신됨

## 중요한 내용
- `WeeklyGroupCards` — `memo` 감싼 export, `groups: WeeklyGroupReport[]`, `selected: string`, `onSelect: (code: string) => void`, `cols?: 1` props
- `PROCESS_ORDER` — TF→HF→VF→NF→AF→PF 순서 상수 (주차마다 순서 흔들림 방지)
- 카드 좌측 accent bar: 활성/감소 시 tone 색, 무변동 시 15% 틴트
- `isDecreasing(delta < 0)` 시 빨간 border·배경으로 강조, `isQuiet(delta===0 && !active)` 시 de-emphasis
- 하단 행: 생산/출고/현재 3열 `grid-cols-3` 고정 분할 (justify-between 위치 흔들림 방지)
- `employeeColor(dept_name)` 으로 부서별 accent 색 결정
- `formatQty` 사용, delta=0이면 "+0" 대신 "변동 없음" 뱃지 표시

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/DesktopWeeklyReportView.tsx]] — 이 컴포넌트를 포함하는 주간보고 데스크톱 뷰
- [[ERP/frontend/app/mes/_components/_weekly_sections/WeeklyDetailTable.tsx]] — 클릭 시 연동되는 상세 테이블
- [[ERP/frontend/lib/api/types/weekly.ts]] — `WeeklyGroupReport` 타입
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS`, `employeeColor`
- [[ERP/frontend/lib/mes/colorUtils.ts]] — `tint`
- [[ERP/frontend/lib/mes/format.ts]] — `formatQty`
