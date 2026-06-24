# useIoSubmit.ts

## 이 파일은 뭐예요?
입출고 제출 API 호출을 감싸는 훅입니다. `clientRequestIdRef`로 멱등 키를 관리해 같은 폼 세션에서 재전송해도 재고가 이중 차감되지 않게 보호합니다.

## 언제 보나요?
- Step 5 "즉시 반영" 또는 "결재 요청" 버튼을 눌러 실제 제출할 때
- 503 과부하 오류 시 같은 키로 재시도하는 흐름을 확인할 때

## 중요한 내용
- `useIoSubmit()` — `{ submitting, submit }` 반환
- `clientRequestIdRef` — 폼 세션 단위 UUID. 성공 또는 503 이외 오류 시 폐기, 503 시 유지
- `makeClientRequestId()` — `@/lib/uuid`에서 가져오는 UUID 생성 함수

## 위험도
🔴 높음 — 재고 이중 차감 방지용 멱등 키 로직. 키 폐기 조건을 잘못 수정하면 같은 작업이 두 번 반영될 수 있음.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — `submit` 함수를 호출하고 결과를 `IoSubmitModals`로 전달하는 최상위 위저드
