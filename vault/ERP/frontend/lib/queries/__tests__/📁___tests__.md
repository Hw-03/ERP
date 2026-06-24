# 📁 __tests__

## 이 폴더는 뭐예요?
`frontend/lib/queries/` 아래 React Query 훅들의 단위 테스트 모음입니다. fetch를 mock하고 QueryClientProvider wrapper를 사용해 각 훅의 HTTP 메서드·URL 파라미터·쿼리 무효화 동작을 검증합니다.

## 언제 여기를 보나요?
- `lib/queries/` 훅을 수정한 뒤 테스트가 깨졌을 때
- 새 훅을 추가하면서 같은 패턴으로 테스트를 작성할 때
- CI에서 frontend 테스트가 실패했을 때 원인 파일을 찾을 때

## 주요 파일
- `useDepartmentsQuery.test.tsx` — 부서 CRUD + 순서변경 훅 5종 검증 (W7-1)
- `useEmployeesQuery.test.tsx` — 직원 CRUD + PIN 초기화 훅 5종 검증 (W7-2)
- `useItemsQuery.test.tsx` — 품목 CRUD + BOM 완성 상태 훅 5종 검증 (W7-3)
- `useModelsQuery.test.tsx` — 모델 CRUD + 순서변경 훅 5종 검증 (W4-A)
- `useDraftCartQuery.test.tsx` — 임시저장 카트 조회 + draft 삭제 mutation 검증
- `useMyItemOrderQuery.test.tsx` — 직원별 품목 커스텀 순서 훅 + `buildEmployeeOrderRank` 순수 함수 검증

## 관련 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/queries/📁_queries]] — 테스트 대상 훅 구현체들이 있는 부모 폴더
