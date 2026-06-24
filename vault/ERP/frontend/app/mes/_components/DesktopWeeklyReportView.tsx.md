# DesktopWeeklyReportView.tsx

> ⛔ 동결 영역(2026-05-24) — 명시 요청 없이 코드 수정 금지

## 이 파일은 뭐예요?
데스크톱 주간보고 탭의 렌더 컴포넌트입니다. 선택된 주(weekMon)의 생산 현황 매트릭스, 공정별 변화 카드, 품목 상세 테이블을 세 영역으로 표시합니다.

## 언제 보나요?
- 데스크톱 사이드바에서 "주간보고" 탭을 선택했을 때

## 중요한 내용
- **props**: `weekMon: Date` — 해당 주 월요일 날짜 (DesktopMesShell에서 WeeklyWeekPicker로 변경)
- `api.getWeeklyReport({ week_start, week_end })` 단일 fetch, weekMon 변경마다 재요청
- **3-영역 레이아웃**
  - 행1 — 생산 현황: `WeeklyProductionMatrix` (KPI 배지 + 모델별 매트릭스). 실적 없으면 얇은 노트로 축소
  - 행2 좌 — 공정별 변화: `WeeklyGroupCards` (클릭으로 우측 연동)
  - 행2 우 — 품목 상세: `WeeklyDetailTable` (선택된 공정 그룹 기준)
- KPI 계산 클라이언트 측: 총수량(`totalQty`), 최다 모델(`topModel`), 활성 부서 수(`activeDepts`)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_weekly_sections/WeeklyProductionMatrix.tsx]] — 모델별 생산 매트릭스
- [[ERP/frontend/app/mes/_components/_weekly_sections/WeeklyGroupCards.tsx]] — 공정별 변화 카드
- [[ERP/frontend/app/mes/_components/_weekly_sections/WeeklyDetailTable.tsx]] — 품목 상세 테이블
- [[ERP/backend/app/routers/inventory/weekly_report.py]] — 주간보고 API 엔드포인트 (동결)
