# WeeklyProductionMatrix.tsx

## 이 파일은 뭐예요?
선택한 주차의 모델별 × 공정별(튜브/고압/진공/튜닝/조립/출하) 생산 수량을 히트맵 테이블로 렌더링하는 컴포넌트입니다. 각 셀은 해당 열의 최댓값 대비 비율로 배경 농도가 달라집니다.

## 언제 보나요?
- 주간보고 화면에서 "모델별 공정 생산 매트릭스" 섹션을 열었을 때
- 주차를 바꿀 때마다 rows props가 교체되며 자동 갱신됨

## 중요한 내용
- `WeeklyProductionMatrix` — `React.memo` 감싼 default export, `rows: WeeklyProductionModelRow[]` 수신
- `COLS` — tf/hf/vf/nf/af/pf 6개 공정 컬럼 정의 (label·dept·key)
- `colMax` — 열별 최댓값 계산 후 8~40% 선형 보간으로 `tintPct` 결정
- `sortedRows` — `model_key` 사전순 정렬로 주차 전환 시 행 순서 고정
- `fmt(n)` — 0은 "—", 나머지는 `toLocaleString()` 반올림 표시
- `ZERO_FADE = LEGACY_COLORS.muted2` — WCAG AA(5.55:1) 충족 de-emphasis 색

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/DesktopWeeklyReportView.tsx]] — 이 컴포넌트를 렌더링하는 주간보고 데스크톱 뷰
- [[ERP/frontend/lib/api/types/weekly.ts]] — `WeeklyProductionModelRow` 타입 정의
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS`, `getDepartmentFallbackColor`
- [[ERP/frontend/lib/mes/colorUtils.ts]] — `tint` 유틸
