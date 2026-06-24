# useAdminMasterItemsList.test.tsx

## 이 파일은 뭐예요?
`useAdminMasterItemsList` 훅의 단위 테스트. `itemSearch`(내부 검색)와 `globalSearch`(상위 전달)를 조합해 `visibleItems`가 올바르게 필터링되는지, `filter` 객체가 현재 검색 상태를 정확히 노출하는지 검증한다.

## 언제 보나요?
- 품목 목록의 검색 필터(내부 검색 + 상위 검색 조합) 로직 수정 시
- `globalSearch`가 `mes_code`까지 포함해 매치하는지 확인할 때

## 중요한 내용
- 외부 의존성 없이 동작
- 검증 케이스:
  - `globalSearch=""` + `itemSearch=""` → 전체 노출
  - `setItemSearch("프로브")` → `item_name` 매치
  - `globalSearch="C-002"` → `mes_code` 매치
  - `globalSearch + itemSearch` 조합 부분 매치
  - `filter` 객체 = `{ itemSearch, globalSearch }` 현재 값

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminMasterItemsList.ts]] — 테스트 대상 훅
- [[ERP/frontend/app/mes/_components/_admin_hooks/__tests__/useAdminMasterItemsCommands.test.tsx]] — 품목 commands 훅 테스트
