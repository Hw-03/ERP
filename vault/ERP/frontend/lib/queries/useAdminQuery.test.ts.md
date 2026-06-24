# useAdminQuery.test.ts

## 이 파일은 뭐예요?
`useAdminQuery.ts`의 5개 훅을 MSW `adminHandlers`로 네트워크 모킹해 검증하는 단위 테스트입니다. PIN 0000 정상 인증·9999 실패, 감사 CSV 목록 반환, 백필 트리거 성공을 커버합니다.

## 언제 보나요?
- admin 훅의 테스트 커버리지를 확인하거나 새 케이스를 추가할 때

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/queries/useAdminQuery.ts]] — 테스트 대상
