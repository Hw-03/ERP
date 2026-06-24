# uuid.ts

## 이 파일은 뭐예요?
클라이언트에서 안전하게 UUID v4를 생성하는 단일 함수 파일입니다. `crypto.randomUUID`가 없는 HTTP LAN 환경(직원 폰의 `http://192.168.x.x`)에서도 `getRandomValues` 또는 `Math.random` 폴백으로 동일 형식의 UUID를 생성합니다.

## 언제 보나요?
- 클라이언트 요청 추적 ID(`client_request_id`) 생성 방식을 바꿀 때
- HTTP(비보안) 환경에서 UUID 생성 오류가 발생할 때

## 중요한 내용
- `makeClientRequestId()` — 유일한 export. 보안 컨텍스트 → `crypto.randomUUID`, 비보안 컨텍스트 → `getRandomValues` 또는 `Math.random` 폴백으로 UUID v4 문자열 반환

## 연결되는 파일
### 먼저 볼 파일
- `useIoSubmit.ts` / `MobileDefectCartFlow.tsx` — 실제로 `makeClientRequestId`를 호출해 요청 ID를 생성
