# useInventoryData.ts

## 이 파일은 뭐예요?
재고(인벤토리) 화면의 품목 목록을 서버에서 불러오는 훅입니다. 검색어(`globalSearch`)가 바뀔 때마다 `api.getItems`를 재호출하고, 선택된 품목의 최신 데이터 동기화는 `onSelectedSync` 콜백으로 호출자에게 위임합니다.

## 언제 보나요?
- 재고 목록이 검색 후 갱신되지 않거나 에러가 뜰 때
- `DesktopInventoryView`의 `items`/`loading`/`error` 상태 흐름을 파악할 때
- 품목 추가/수정 후 강제 새로고침(`loadItems`) 호출 경로를 확인할 때

## 중요한 내용
- `UseInventoryDataOptions`: `globalSearch`, `onStatusChange`, `onSelectedSync?`
- `UseInventoryDataResult`: `items`, `setItems`, `loading`, `error`, `loadItems`
- `api.getItems({ limit: 2000, search })` — 최대 2000건 일괄 조회
- `onSelectedSync`: 새 목록 기준으로 선택 품목 갱신을 상위 컴포넌트가 처리
- Round-7(R7-HOOK2) 추출 이력 — DesktopInventoryView에서 분리됨

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api.ts]] — api.getItems 호출
- [[ERP/frontend/app/mes/_components/📁__components]] — DesktopInventoryView (이 훅의 주 사용처)
