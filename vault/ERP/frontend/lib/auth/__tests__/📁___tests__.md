# 📁 __tests__

## 이 폴더는 뭐예요?
`frontend/lib/auth/` 모듈의 단위 테스트 모음입니다. 관리자 세션(PIN) 관련 Provider·훅·API 헤더 주입 동작을 vitest + testing-library로 검증합니다.

## 언제 여기를 보나요?
- `admin-session`의 PIN 상태 관리나 `X-Admin-Pin` 헤더 주입 로직을 수정할 때
- auth 관련 테스트가 실패해 원인을 파악할 때

## 주요 파일
- `admin-session.test.tsx` — AdminSessionProvider·useAdminSession 훅 및 api-core PIN 주입 검증

## 관련 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/auth/admin-session.tsx]] — 테스트 대상 Provider·훅
- [[ERP/frontend/lib/api-core.ts]] — PIN 헤더 주입이 일어나는 fetch 래퍼
