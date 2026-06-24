# MobileWeeklyScreen.tsx

## 이 파일은 뭐예요?
주간보고 모바일 전용 뷰. frozen 컴포넌트(`WeeklyGroupCards`, `WeeklyDetailTable`, `WeeklyProductionMatrix`)를 import만 해서 재사용하고, 데이터 오케스트레이션(`api.getWeeklyReport`, `selectedCode`)은 데스크톱 뷰에서 복제했다. 가로 와이드 테이블인 `WeeklyProductionMatrix`는 `overflow-x-auto`로 모바일에서 가로 스크롤한다.

## 언제 보나요?
- `MobileMoreScreen`에서 "주간보고" 버튼을 눌렀을 때
- `MobileShell`의 주간보고 탭 또는 전환 화면으로 렌더될 때

## 중요한 내용
- `MobileWeeklyScreen({ weekMon })` — 기본 export; `weekMon`은 셸이 관리하는 주 시작 Monday 날짜
- 생산 현황 KPI 배지(`Kpi`) — 총수량·최다모델·생산부서 수를 상단에 요약
- 3개 섹션: ① 생산 현황(매트릭스 표) ② 공정별 변화(`WeeklyGroupCards cols=1`) ③ 품목 상세(`WeeklyDetailTable`)
- `reloadNonce` — 오류 시 재시도 트리거
- frozen 주의: `_weekly_sections/` 하위 컴포넌트와 `weekly_report.py` 백엔드는 명시적 요청 없이 수정 금지

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_weekly_sections/WeeklyGroupCards.tsx]] — 공정별 변화 카드(frozen)
- [[ERP/frontend/app/mes/_components/_weekly_sections/WeeklyDetailTable.tsx]] — 품목 상세 표(frozen)
- [[ERP/frontend/app/mes/_components/_weekly_sections/WeeklyProductionMatrix.tsx]] — 생산 현황 매트릭스(frozen)
- [[ERP/frontend/app/mes/_components/mobile/screens/MobileMoreScreen.tsx]] — 진입점
