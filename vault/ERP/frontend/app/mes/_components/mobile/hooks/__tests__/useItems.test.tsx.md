# useItems.test.tsx

## 이 파일은 뭐예요?
`useItems` 훅의 단위 테스트. `api.getItems`를 모킹하여 초기 fetch, AbortError 무시, 일반 에러 노출, 필터 빠른 변경 시 마지막 결과만 반영(경쟁 조건 처리)을 검증한다.

## 언제 보나요?
- `useItems` 훅의 abort 로직이나 에러 처리 수정 후 회귀 확인할 때
- 필터 연속 변경 시 이전 요청 취소 동작을 확인할 때

## 중요한 내용
- `AbortError`는 `error` state에 노출하지 않음 — 이 계약을 별도 케이스로 검증
- 필터 변경 시 첫 번째 요청이 abort되고 두 번째 결과만 `items`에 반영됨을 `rerender`로 확인
- `api.getItems`가 받는 `opts.signal`의 `abort` 이벤트를 수동으로 처리하는 mock 포함

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/hooks/useItems.ts]] — 테스트 대상 훅
- [[ERP/frontend/lib/api.ts]] — 모킹되는 `api.getItems` 원본
