# useToggleSet.ts

## 이 파일은 뭐예요?
필터 칩(부서/모델/공정/작업 등)에서 "있으면 빼고 없으면 넣는" 토글 패턴을 문자열 집합으로 통합 관리하는 범용 훅입니다. 프로젝트 전체 toggle 중복 패턴 12개를 하나로 통합했습니다.

## 언제 보나요?
- 필터 칩이 여러 개인 화면(재고·내역 등)에서 선택 상태 관리 흐름을 볼 때
- 토글 시 페이지네이션을 리셋하는 연동 로직을 추가해야 할 때
- 새로운 필터 종류를 추가할 때

## 중요한 내용
- `useToggleSet(onChange?)` 시그니처 — `onChange`는 toggle 시마다 호출 (setSelected/clear에는 미호출)
- 반환값: `{ selected, toggle, setSelected, clear }`
- `selected`: 현재 선택된 값들의 `string[]`
- `toggle(value)`: 있으면 제거, 없으면 추가
- `clear()`: 전체 선택 해제
- `onChangeRef` 패턴으로 onChange 항상 최신 참조 유지 (`useResource`와 동일 패턴)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/📁__components]] — 부서/모델/공정 필터 칩이 있는 뷰 컴포넌트들
