# useToggleSet.test.tsx

## 이 파일은 뭐예요?
`useToggleSet` 훅의 선택 집합 관리 동작을 검증하는 Vitest 테스트 파일. toggle/setSelected/clear, onChange 콜백 호출 조건, 함수 참조 안정성, 최신 콜백 ref 동작 등 7가지 케이스를 확인한다.

## 언제 보나요?
- `useToggleSet` 훅 수정 후 toggle·clear·onChange 동작의 회귀 여부를 확인할 때
- 체크박스·필터 다중 선택 로직에 버그가 의심될 때

## 중요한 내용
- toggle: 없으면 추가, 있으면 제거 (배열 순서 유지)
- setSelected/clear는 onChange를 호출하지 않음 — toggle만 onChange 트리거
- toggle 함수는 리렌더 간 참조 안정성 보장(useCallback 기반)
- onChange는 항상 최신 콜백을 참조(ref 패턴)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_hooks/useToggleSet.ts]] — 테스트 대상 훅 구현
