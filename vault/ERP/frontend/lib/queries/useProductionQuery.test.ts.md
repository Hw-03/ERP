# useProductionQuery.test.ts

## 이 파일은 뭐예요?
`useProductionQuery.ts`의 5개 훅을 MSW `productionHandlers`로 네트워크 모킹해 검증하는 단위 테스트입니다. 생산 가능량·트랜잭션 목록(파라미터 유무)·수정 이력·생산 입고·메타 수정 성공을 커버합니다.

## 언제 보나요?
- production 훅의 테스트 커버리지를 확인하거나 새 케이스를 추가할 때

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/queries/useProductionQuery.ts]] — 테스트 대상
