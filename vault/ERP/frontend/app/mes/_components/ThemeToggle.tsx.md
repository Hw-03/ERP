# ThemeToggle.tsx

## 이 파일은 뭐예요?
라이트/다크 모드를 전환하는 토글 버튼입니다. 전환 시 `document.documentElement`의 `data-theme` 속성을 변경하고, localStorage 및 백엔드(`api.setEmployeeTheme`)에 모두 저장합니다.

## 언제 보나요?
- 데스크톱 사이드바 하단에 항상 표시됨
- 테마 전환 로직이나 저장 방식을 수정할 때

## 중요한 내용
- `ThemeToggle({ expanded? })` — `expanded=true`이면 아이콘 옆에 텍스트 레이블이 슬라이드인
- 초기값: `operator.theme` 우선 → 없으면 `localStorage.getItem("theme")`
- 토글 시: localStorage 저장 + 로그인 상태면 `api.setEmployeeTheme` fire-and-forget + `setCurrentOperator`로 메모리 갱신

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/login/useCurrentOperator.ts]] — `useCurrentOperator`, `setCurrentOperator`
- [[ERP/frontend/lib/api.ts]] — `setEmployeeTheme` API
