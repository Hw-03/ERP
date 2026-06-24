# useBomQuery.ts

## 이 파일은 뭐예요?
BOM(자재 명세서) 목록·상세·트리·역방향 조회와 BOM 행 추가·수정·삭제 mutation을 제공하는 React Query 훅 모음입니다.

## 언제 보나요?
- BOM 화면에서 품목의 구성 자재 목록이나 트리 구조를 보여줄 때
- 어떤 제품에 특정 부품이 사용되는지 역방향 조회(`useBomWhereUsedQuery`)를 추적할 때

## 중요한 내용
- `useBomListQuery()` — 전체 BOM(`BOMDetailEntry[]`) 목록
- `useBomQuery(parentId)` — 특정 상위 품목의 BOM(`BOMEntry[]`), `parentId` 없으면 비활성
- `useBomTreeQuery(parentId)` — 재귀 트리 구조
- `useBomWhereUsedQuery(itemId)` — 역방향: 이 품목이 어느 BOM에 포함되는지
- `useCreateBomMutation` / `useUpdateBomMutation` / `useDeleteBomMutation` — 성공 시 `queryKeys.bom.all` invalidate
- `catalogApi` BOM 관련 메서드에 1:1 대응

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/catalog]] — 실제 API 호출 함수
- [[ERP/frontend/lib/queries/keys.ts]] — 쿼리 키 정의
