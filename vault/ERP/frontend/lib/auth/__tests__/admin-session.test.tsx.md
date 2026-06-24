# admin-session.test.tsx

## 이 파일은 뭐예요?
`AdminSessionProvider`와 `useAdminSession` 훅을 vitest로 검증하는 테스트 파일입니다. Provider 밖에서 훅 호출 시 throw, PIN 설정/초기화 동작, 그리고 `postJson`·`fetcher` 호출 시 `X-Admin-Pin` 헤더 자동 주입 여부를 포함한 7개 케이스를 검사합니다.

## 언제 보나요?
- `admin-session.ts`(Provider/훅)를 수정하거나 PIN 주입 로직을 건드릴 때
- `api-core`의 `postJson`·`fetcher` 헤더 처리를 바꿀 때

## 중요한 내용
- `useAdminSession` — Provider 외부에서 호출하면 `/AdminSessionProvider/` 메시지로 throw 검증
- `setPin` / `clearPin` — PIN이 null → 문자열 → null 로 상태 전환됨을 확인
- `postJson` + `fetcher` PIN 주입 — `X-Admin-Pin` 헤더가 PIN 설정 후 포함되고, Provider 언마운트 후 사라짐을 `globalThis.fetch` mock으로 검증
- `makeOkResponse` 헬퍼 — `{ ok: true, status: 200, json, text }` 형태의 Response 목을 생성

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/auth/admin-session.tsx]] — 테스트 대상: AdminSessionProvider, useAdminSession
- [[ERP/frontend/lib/api-core.ts]] — 테스트 대상: postJson, fetcher (X-Admin-Pin 헤더 주입 경로)
