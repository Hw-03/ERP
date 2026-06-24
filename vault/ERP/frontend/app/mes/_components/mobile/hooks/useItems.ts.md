# useItems.ts

## 이 파일은 뭐예요?
모바일 화면에서 품목 목록을 페이지 단위(100건)로 가져오는 훅입니다. 검색어·부서 필터가 바뀌면 AbortController로 이전 요청을 중단하고 새 결과만 반영하며, `loadMore`로 무한 스크롤을 지원합니다.

## 언제 보나요?
- 모바일 입출고 화면에서 품목 검색 및 선택할 때
- 부서별 필터 + 텍스트 검색을 조합해 품목을 좁혀볼 때
- 목록 하단에 도달했을 때 추가 페이지를 불러올 때

## 중요한 내용
- `ItemsFilters` 타입: `{ search?, department? }` — `"ALL"` 이면 전체 부서
- `PAGE_SIZE = 100` — 한 번에 가져오는 최대 건수
- `useItems(filters)` — `{ items, loading, error, hasMore, loadMore, refetch }` 반환
- `activeCtrlRef` — 최신 요청의 AbortController를 추적, 필터 변경·unmount 시 abort
- `filterKey = JSON.stringify(filters)` — 의존성 비교용 직렬화 키 (Cat-A 패턴)
- `buildParams()` — `"ALL"` 부서와 빈 검색어를 걸러서 API 파라미터 조립

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api.ts]] — `api.getItems`, `Item` 타입 정의
