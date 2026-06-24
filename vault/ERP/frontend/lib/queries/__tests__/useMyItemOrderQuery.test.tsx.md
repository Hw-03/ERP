# useMyItemOrderQuery.test.tsx

## 이 파일은 뭐예요?
직원별 품목 커스텀 순서 훅 3종(`useMyItemOrderQuery`, `usePutMyItemOrderMutation`, `useResetMyItemOrderMutation`)과 순수 함수 `buildEmployeeOrderRank`를 검증하는 단위 테스트입니다.

## 언제 보나요?
- 직원별 품목 순서 기능(`/api/items/my-order`)을 수정한 뒤 회귀 검증할 때
- `buildEmployeeOrderRank`의 순서 우선순위 로직(내 순서 있으면 앞, 신규는 `Infinity`로 뒤)이 바뀌지 않았는지 확인할 때

## 중요한 내용
- 검증 대상: `useMyItemOrderQuery`, `usePutMyItemOrderMutation`, `useResetMyItemOrderMutation`, `buildEmployeeOrderRank`
- `buildEmployeeOrderRank`: entries 배열 → `Map<item_id, display_order>` 반환. entries 없으면 빈 Map(부서순 폴백), 미등록 품목은 `Infinity`
- `useMyItemOrderQuery`: `employeeId === null`이면 fetch 미호출
- `usePutMyItemOrderMutation`: `PUT /api/items/my-order` + `queryKeys.myItemOrder.byEmployee(employee_id)` invalidate
- `useResetMyItemOrderMutation`: `DELETE /api/items/my-order?employee_id={id}` + 동일 invalidate

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/queries/useMyItemOrderQuery.ts]] — 테스트 대상 훅 구현체
- [[ERP/frontend/lib/queries/keys.ts]] — `queryKeys.myItemOrder.byEmployee` 쿼리 키 정의
- [[ERP/frontend/app/mes/_components/_warehouse_v2/itemPickerShared.tsx]] — `buildEmployeeOrderRank` 순수 함수 정의
