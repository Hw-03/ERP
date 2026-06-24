# HistoryStatsBar.tsx

## 이 파일은 뭐예요?
입출고 내역 화면 상단의 요약 KPI 표시줄입니다. 기간 전체 건수(Y)와 현재 필터 적용 건수(X)를 `X건 / 전체 Y건` 형태로 보여주고, 창고·부서·수량조정 3가지 카테고리별 건수를 박스 3개로 나열합니다. 클릭 필터 기능은 없는 표시 전용 컴포넌트입니다.

## 언제 보나요?
- 입출고 내역 화면에서 현재 기간/필터 상태의 건수를 한눈에 파악할 때

## 중요한 내용
- `export interface HistoryStatsBarProps { baseline, currentCount, loading, periodLabel }` — `baseline`은 기간 전체(필터 무관), `currentCount`는 현재 필터 적용 후
- `StatBox` — 창고(green)/부서(cyan)/수량조정(yellow) 3개 박스 내부 컴포넌트
- `NUM` 헬퍼 — loading 중이면 "…" 표시
- 3차에서 클릭 필터 기능을 폐기하고 표시 전용으로 단순화됨

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_history_sections/HistoryFilterPanel.tsx]] — 실제 필터는 이 패널이 담당
