# SummaryChipBar.tsx

## 이 파일은 뭐예요?
선택된 필터나 요약 조건들을 가로 스크롤 가능한 pill 칩 목록으로 보여주는 컴포넌트입니다. 각 칩은 클릭·제거(X) 동작을 독립적으로 지원합니다.

## 언제 보나요?
- 위저드 헤더에서 이전 단계에서 선택한 항목을 요약 칩으로 표시할 때 (WizardHeader와 함께 사용)
- 검색/필터 조건 선택 결과를 태그 형태로 나열할 때

## 중요한 내용
- `SummaryChipBar({ chips, trailing?, className? })` — `chips`가 비어있고 `trailing`도 없으면 `null` 반환
- `SummaryChip` 타입: `{ key, label, tone?, onClick?, onRemove? }`
- `onClick`이 있으면 `<button>`, 없으면 `<div>`로 렌더링
- `onRemove`가 있으면 칩 우측에 X 버튼 추가 (44x44 hit-area 보장)
- `tone` 기본값 `LEGACY_COLORS.blue`, 배경 1a/테두리 44 불투명도

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/primitives/WizardHeader.tsx]] — `SummaryChipBar` 소비처
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 팔레트 출처
