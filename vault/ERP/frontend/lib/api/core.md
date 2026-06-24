# core.ts

## 이 파일은 뭐예요?
`frontend/lib/api-core.ts`의 thin re-export 래퍼입니다. 기존 `@/lib/api-core` import 경로와의 호환을 유지하면서, 새 코드는 `@/lib/api/core`를 사용하도록 유도합니다.

## 언제 보나요?
- `@/lib/api/core`로 fetch 유틸(fetcher, postJson, toApiUrl 등)을 import할 때
- api-core.ts 본체가 어디 있는지 확인하고 싶을 때

## 중요한 내용
- 실제 로직 없음 — `export * from "../api-core"` 한 줄
- 본체: `frontend/lib/api-core.ts`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api-core.ts]] — fetch 래퍼·URL 빌더·에러 파서 본체
