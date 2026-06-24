# useWarehouseData.ts

## 이 파일은 뭐예요?
창고/입출고 화면에서 필요한 직원 목록·품목 목록·제품 모델 목록을 한꺼번에 불러오는 커스텀 훅입니다. 직원·품목은 `globalSearch` 변경 시마다 다시 fetch하고, 모델 목록은 React Query 캐시(`useModelsQuery`)를 공유합니다.

## 언제 보나요?
- 창고 화면(입출고 패널 등)에서 초기 데이터 로딩 흐름을 추적할 때
- `loading` 상태가 왜 true/false인지, 에러 메시지가 어디서 오는지 확인할 때
- 품목 검색(`globalSearch`) 변경 시 재요청 로직을 수정할 때

## 중요한 내용
- `useWarehouseData({ globalSearch, onStatusChange })` — 인자로 전역 검색어와 상태 메시지 콜백을 받음
- 반환값: `{ employees, items, productModels, loadFailure, loading, setItems }`
- `loading` — 직원·품목 첫 로딩 동안만 true. 모델은 부수 데이터라 포함하지 않음
- `productModels` — `useModelsQuery()` 캐시에서 가져오며, 없으면 빈 배열(`EMPTY_MODELS`) 반환
- 품목 fetch는 최대 2000건(`limit: 2000`) + `globalSearch` 기반 서버사이드 검색
- `setItems` 를 반환하여 외부에서 낙관적 업데이트 가능

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/queries/useModelsQuery.ts]] — 모델 목록 React Query 훅 (캐시 공유)
- [[ERP/frontend/lib/api.ts]] — `api.getEmployees`, `api.getItems` 실제 fetch 함수
