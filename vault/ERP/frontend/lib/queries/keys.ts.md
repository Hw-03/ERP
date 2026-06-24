# keys.ts

## 이 파일은 뭐예요?
React Query 쿼리 키를 도메인별로 정의한 중앙 레지스트리입니다. 모든 `useXxxQuery` 훅은 여기서 키를 가져다 써야 하며, `invalidateQueries` 범위도 이 구조로 결정됩니다.

## 언제 보나요?
- 새 도메인 훅을 추가할 때 키 구조를 확인하거나 추가할 때
- `invalidateQueries`가 의도한 범위를 갱신하는지 확인할 때

## 중요한 내용
- `queryKeys` 객체 하나에 모든 도메인이 집결. 현재 도메인: `models`, `departments`, `employees`, `items`, `transactions`, `bom`, `inventory`, `settings`, `stockRequests`, `notifications`, `production`, `admin`, `myItemOrder`
- 각 도메인마다 `all` (전체 invalidate용 루트 키) + `list(params?)` / `detail(id)` 등 세부 키 함수 제공
- `as const` 타입 추론으로 키 배열이 리터럴 타입으로 고정됨

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/queries/client.tsx]] — QueryClient와 staleTime 상수 정의
