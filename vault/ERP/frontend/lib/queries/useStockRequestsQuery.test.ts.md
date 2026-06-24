# useStockRequestsQuery.test.ts

## 이 파일은 뭐예요?
`useStockRequestsQuery.ts`의 4개 훅을 MSW `stockRequestsHandlers`로 네트워크 모킹해 검증하는 단위 테스트입니다. 창고 대기열 목록(2건), PIN 기반 승인 성공/실패, 반려, 취소를 커버합니다.

## 언제 보나요?
- stockRequests 훅의 테스트 커버리지를 확인하거나 새 케이스를 추가할 때

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/queries/useStockRequestsQuery.ts]] — 테스트 대상
