# KpiCard.tsx

## 이 파일은 뭐예요?
KPI 지표(라벨·수치·단위·설명)를 카드 형태로 보여주는 컴포넌트입니다. onClick 제공 시 토글 가능한 버튼이 되며, active 상태에 따라 배경 강조도가 변합니다.

## 언제 보나요?
- 생산 현황 대시보드에서 "출하 준비", "빠른 조립", "총 생산" 같은 수치 카드를 렌더할 때
- KPI 카드를 클릭해 해당 범주로 필터링을 연동할 때

## 중요한 내용
- `tone` — 필수; 색상 문자열(CSS color). `tint(tone, n)`으로 배경 명도 조절
- `active` — true면 tint 22%, hovered면 16%, 기본 8%
- `unit` — 수치 뒤 작은 텍스트로 단위 표시 (예: "건")
- `hint` — 수치 아래 소형 보조 텍스트
- `compact` — true면 가로 배치(`flex justify-between`), false면 세로 배치(기본)
- onClick 없으면 `<div>`, 있으면 `aria-pressed` 포함 `<button>`으로 렌더

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes/colorUtils.ts]] — tint 헬퍼 함수
- [[ERP/frontend/app/mes/_components/common/index.ts]] — re-export 포함
