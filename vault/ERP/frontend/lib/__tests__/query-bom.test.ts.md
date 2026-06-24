# query-bom.test.ts

## 이 파일은 뭐예요?
MSW와 React Query를 결합한 BOM 관련 hook 통합 테스트 파일(W7-5)입니다. `useBomListQuery`, `useBomQuery`, `useBomTreeQuery`, `useBomWhereUsedQuery`의 조회 hook과 생성·수정·삭제 mutation hook이 실제 API 응답 형태와 에러 상황을 올바르게 처리하는지 검증합니다.

## 언제 보나요?
- BOM 관련 React Query hook(`useBomQuery` 계열)을 수정하거나 새로 추가할 때
- MSW BOM 핸들러(`msw/handlers/bom.ts`)를 변경했을 때 영향 범위를 확인할 때

## 중요한 내용
- `useBomListQuery` — 전체 BOM 목록 조회, 404 에러 처리 검증
- `useBomQuery(parentId)` — 특정 부모 항목의 BOM 필터 조회
- `useBomTreeQuery(parentId)` — 트리 구조 반환, `parentId` 빈 문자열 시 쿼리 비활성화(`fetchStatus: "idle"`) 확인
- `useBomWhereUsedQuery(itemId)` — 역방향(where-used) BOM, 빈 문자열 비활성화 확인
- `useCreateBomMutation` — POST, 응답 `bom_id: "bom-new"` 검증
- `useUpdateBomMutation` — PATCH, 변경된 `quantity` 반환 검증
- `useDeleteBomMutation` — DELETE, 204 성공 검증

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/queries/useBomQuery.ts]] — 테스트 대상 hook 구현체
- [[ERP/frontend/lib/__tests__/msw/handlers/bom.ts]] — MSW mock 핸들러(BOM)
- [[ERP/frontend/lib/__tests__/msw/server.ts]] — MSW 서버 설정
