# useProductionQuery.ts

## 이 파일은 뭐예요?
생산 가능량 조회, 기준 PF(완제품) 설정/해제, 생산 입고 등록, 트랜잭션 목록·수정 이력 조회, 메타 수정·수량 보정을 담당하는 React Query 훅 모음입니다.

## 언제 보나요?
- 생산 가능 수량 화면에서 데이터 흐름을 추적할 때
- 기준 PF 지정/해제(`useSetPfPinMutation` / `useClearPfPinMutation`)가 어떻게 캐시를 즉시 갱신하는지 확인할 때

## 중요한 내용
- `useProductionCapacityQuery` — `GET /production/capacity` 호출
- `usePfPinsQuery` / `useSetPfPinMutation` / `useClearPfPinMutation` — 기준 PF 설정. mutation 성공 시 `qc.setQueryData`로 낙관적 갱신 (invalidate 없이 캐시 직접 수정)
- `useTransactionsQuery(params?)` — 트랜잭션 목록 (production 키 사용, `useTransactionsQuery.ts`의 동명 훅과 별개)
- `useTransactionEditsQuery(logId)` — 수정 이력
- `useProductionReceiptMutation` — 생산 입고 등록
- `useMetaEditTransactionMutation` / `useQuantityCorrectMutation` — 트랜잭션 메타·수량 보정
- 모든 mutation 성공 시 `queryKeys.production.all` invalidate

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/production]] — 실제 API 호출 함수
- [[ERP/frontend/lib/queries/keys.ts]] — 쿼리 키 정의
