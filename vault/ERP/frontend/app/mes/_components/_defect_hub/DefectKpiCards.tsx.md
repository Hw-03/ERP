# DefectKpiCards.tsx

## 이 파일은 뭐예요?
불량 탭 KPI 카드 2장(격리 중 건수, 1년 이상 건수)을 렌더링하는 컴포넌트다. "1년 이상" 카드는 클릭 시 목록 필터로 연동된다.

## 언제 보나요?
- 불량 탭 목록 화면 상단에 항상 표시됨
- `DefectHubPanel`과 데스크톱 불량 뷰 모두에서 사용

## 중요한 내용
- `DefectKpiKind`: `"quarantined" | "over_one_year"` — 클릭 가능한 KPI 종류
- `kpi: DefectKpi`: `{ quarantined: number, over_one_year: number }` 백엔드에서 받은 집계값
- `scopeLabel` prop: 카드 hint에 "조립 부서 기준" 등 범위 표시
- `activeFilter` / `onCardClick`: 1년 이상 카드 클릭 시 필터 활성화 토글
- `KpiCard` 공용 컴포넌트 사용

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/common/KpiCard.tsx]] — 공용 KPI 카드
- [[ERP/frontend/app/mes/_components/_defect_hub/DefectHubPanel.tsx]] — KPI 필터 연동
- [[ERP/frontend/lib/api/types/defects.ts]] — `DefectKpi` 타입
