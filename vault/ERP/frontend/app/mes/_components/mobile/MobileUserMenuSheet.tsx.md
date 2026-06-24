# MobileUserMenuSheet.tsx

## 이 파일은 뭐예요?
모바일 헤더 우측의 이름 첫 글자 버튼을 누르면 올라오는 BottomSheet. 현재 로그인 사용자 정보(이름·부서·직급·역할 배지) 표시, PIN 변경(현재→새→확인 3단계), 로그아웃 확인 흐름을 담고 있다.

## 언제 보나요?
- 모바일 앱에서 헤더 우측의 이름 이니셜 버튼을 탭했을 때
- PIN을 바꾸거나 로그아웃해야 할 때

## 중요한 내용
- `MobileUserMenuSheet({ open, onClose })` — 유일한 export
- `PinStep` 타입: `"idle" | "current" | "new" | "confirm"` 순서로 상태 전환
- `api.changeMyPin(employee_id, currentPin, newPin)` 호출로 PIN 변경 처리
- `clearCurrentOperator()` + `window.location.reload()` 로 로그아웃 처리
- `WAREHOUSE_ROLE_LABEL` / `DEPARTMENT_ROLE_LABEL` 맵으로 역할 배지 텍스트 결정
- 에러 상태(`pinError`)는 인라인 표시, 로그아웃은 이중 확인(confirmLogout)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/MobileShell.tsx]] — 이 Sheet를 열고 닫는 상위 컴포넌트
- [[ERP/frontend/app/mes/_components/mobile/tokens.ts]] — TYPO 토큰 사용
- [[ERP/frontend/app/mes/_components/login/useCurrentOperator.ts]] — 현재 로그인 사용자 읽기·초기화
- [[ERP/frontend/lib/api.ts]] — `api.changeMyPin` 호출
