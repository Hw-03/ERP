# AdminKpiBar.tsx

## 이 파일은 뭐예요?
어드민 화면 상단에 KPI 카드들을 가로 그리드로 나열하는 바(bar) 컴포넌트입니다. 항목 수에 따라 자동으로 열 수를 맞추며, 클릭 시 필터 역할도 할 수 있습니다.

## 언제 보나요?
- 부서 관리·직원 관리 등 어드민 섹션 페이지 상단에서 "전체 N명", "활성 N명" 같은 집계 수치를 카드로 보여줄 때
- KPI 카드를 클릭해 목록을 특정 상태로 필터링할 때

## 중요한 내용
- `AdminKpiItem` — `{ key, label, value, hint?, tone, active?, onClick? }` 타입
- `AdminKpiBarProps` — `items: AdminKpiItem[]` 단일 props
- `items`가 비어있으면 `null` 반환(렌더링 없음)
- 내부적으로 공통 `KpiCard` 컴포넌트에 `compact` 플래그를 넘겨 렌더링
- 그리드 열 수는 `items.length`로 동적 계산(`gridTemplateColumns: repeat(N, ...)`)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/common/KpiCard.tsx]] — 실제 카드 UI 담당
- [[ERP/frontend/app/mes/_components/_admin_sections/_admin_primitives/index.ts]] — 외부 노출 진입점
