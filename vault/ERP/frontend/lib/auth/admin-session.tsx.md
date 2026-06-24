# admin-session.tsx

## 이 파일은 뭐예요?
관리자 PIN을 in-memory로 보관하고 모든 API 요청에 `X-Admin-Pin` 헤더를 자동 주입하는 React Context Provider와 훅을 제공합니다. mount 시 `api-core.ts`의 `registerAdminPinProvider`에 콜백을 등록해, 별도 호출 코드 수정 없이 PIN이 있을 때만 헤더가 붙습니다.

## 언제 보나요?
- 관리자 PIN 입력/초기화 흐름을 수정할 때
- `X-Admin-Pin` 헤더가 API 요청에 제대로 붙는지 디버깅할 때
- PIN이 왜 새로고침 후 사라지는지 확인할 때 (의도적 in-memory 설계)

## 중요한 내용
- `AdminSessionProvider` — 앱 루트에 감싸야 하는 Provider. mount 시 `registerAdminPinProvider`에 등록, unmount 시 null 콜백으로 해제
- `useAdminSession()` — `{ pin, setPin, clearPin }` 반환. Provider 밖에서 호출하면 에러
- `AdminSessionValue` — 인터페이스 타입 export (pin: string | null, setPin, clearPin)
- **in-memory only**: localStorage/sessionStorage 미사용. 새로고침 시 PIN 재입력 필요 (보안 의도)
- `pinRef` 패턴으로 콜백 stale closure 방지

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api-core.ts]] — `registerAdminPinProvider`를 받아 실제 헤더 주입을 처리하는 API 코어
- [[ERP/frontend/lib/auth/constants.ts]] — PIN 자릿수 상수 (`PIN_LENGTH`)
