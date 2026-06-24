# useMyItemOrderQuery.ts

## 이 파일은 뭐예요?
직원별 개인 품목 순서(커스터마이징 정렬)를 조회·저장·초기화하는 React Query 훅 모음입니다.

## 언제 보나요?
- 내 품목 순서 드래그 편집 화면이나 순서 초기화 버튼의 동작을 추적할 때
- `ItemOrderEntry` 타입을 확인할 때 (이 파일이 re-export)

## 중요한 내용
- `useMyItemOrderQuery(employeeId)` — `employeeId` 없으면 비활성
- `usePutMyItemOrderMutation` — `{ employee_id, items: ItemOrderEntry[] }` 저장, 성공 시 해당 직원 키만 pinpoint invalidate
- `useResetMyItemOrderMutation` — `employeeId` 문자열, 성공 시 해당 직원 키만 pinpoint invalidate
- `ItemOrderEntry` 타입을 `@/lib/api/items`에서 가져와 re-export

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/items]] — `getMyItemOrder`, `putMyItemOrder`, `resetMyItemOrder` 실제 API
- [[ERP/frontend/lib/queries/keys.ts]] — `myItemOrder.byEmployee` 키
