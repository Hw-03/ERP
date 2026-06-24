# QuickActionGrid.tsx

## 이 파일은 뭐예요?
아이콘 + 라벨 + 설명으로 구성된 빠른 액션 버튼들을 2열 또는 3열 그리드로 배치하는 컴포넌트입니다. 각 셀에 accent 색상 아이콘 박스와 텍스트를 포함합니다.

## 언제 보나요?
- 홈 화면이나 More 탭에서 자주 쓰는 기능 바로가기를 그리드로 나열할 때
- 특정 화면 진입 전 주요 액션을 선택지로 제시할 때

## 중요한 내용
- `QuickActionGrid({ actions, columns?, className? })` — `columns`는 `2(기본)` 또는 `3`
- `QuickAction` 인터페이스: `{ id, label, description?, icon, tone?, onClick, disabled? }`
- `tone` 미지정 시 `LEGACY_COLORS.blue` 기본 accent 색
- `disabled=true`이면 opacity-40 + 클릭 비활성
- `export type QuickAction` 로 타입도 함께 export

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/tokens.ts]] — `TYPO` 타이포 토큰 출처
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 팔레트 출처
