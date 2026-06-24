# useAdminBootstrap.ts

## 이 파일은 뭐예요?
관리자 화면이 잠금 해제될 때 품목·직원·부서·모델·전체BOM 5개 도메인 데이터를 한 번에 불러오는 부트스트랩 훅입니다. React Query(모델)와 직접 API 호출(나머지)을 조합해 로딩 진입점을 단일화합니다.

## 언제 보나요?
- `DesktopAdminView`가 마운트되어 관리자 PIN 잠금이 풀릴 때
- 전역 검색어(`globalSearch`)가 바뀌어 품목·직원·부서를 재조회해야 할 때
- BOM 완료 토글 후 품목 목록만 다시 가져와야 할 때(`refreshItems`)

## 중요한 내용
- `useAdminBootstrap(opts: UseAdminBootstrapOptions): UseAdminBootstrapResult`
  - `unlocked`: 잠금 해제 여부 — `true`가 되는 순간 fetch 시작
  - `globalSearch`: 품목 검색어 (변경 시 `loadData` 재실행)
  - `loadData()`: items / employees / departments 동시 조회(`Promise.all`)
  - `refreshAllBom()`: 전체 BOM rows 재조회
  - `refreshItems()`: 품목만 재조회 (BOM 완료 토글 후 `bom_completed_at` 반영)
- models는 `useModelsQuery`로 분리돼 React Query 캐시를 로컬 `productModels` state에 미러링

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminViewState.ts]] — `unlocked` 상태 제공원
- [[ERP/frontend/lib/queries/useModelsQuery.ts]] — 모델 React Query 훅
- [[ERP/frontend/lib/api.ts]] — `api.getItems`, `api.getEmployees`, `api.getDepartments`, `api.getAllBOM`
