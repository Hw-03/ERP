# useAdminMasterItemsList.ts

## 이 파일은 뭐예요?
품목 목록에 로컬 검색(`itemSearch`)과 전역 검색(`globalSearch`)을 합산해 `visibleItems`를 계산하는 List sub-hook입니다.

## 언제 보나요?
- 품목 목록 검색이 동작하지 않을 때
- 전역 검색과 섹션 내부 검색이 어떻게 AND 결합되는지 확인할 때

## 중요한 내용
- `useAdminMasterItemsList({ items, globalSearch }): UseAdminMasterItemsListState`
- keyword = `globalSearch + " " + itemSearch` 합산 후 `matchesItemSearch` 에 전달
- 두 검색어 모두 비어 있으면 전체 목록 그대로 반환 (단락 최적화)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/itemSearch.ts]] — `matchesItemSearch` 함수
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminMasterItems.ts]] — 이 훅을 포함하는 wrapper
