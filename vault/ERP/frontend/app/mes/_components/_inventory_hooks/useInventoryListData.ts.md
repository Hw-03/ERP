# useInventoryListData.ts

## 이 파일은 뭐예요?
모바일 재고 화면(`InventoryScreen`)의 데이터 파생 로직을 담은 커스텀 훅. `useItems`로 품목 목록을 가져온 뒤 KPI 상태(OK/LOW/ZERO)·품목 유형(RAW/SEMI/FIXED)·모델 슬롯·그룹화 필터를 적용해 화면에 그릴 `rows`와 집계 `totals`를 반환한다.

## 언제 보나요?
- 모바일 재고 화면에서 필터 조건이 바뀔 때 어떤 로직으로 목록이 걸러지는지 파악할 때
- KPI 필터(정상/부족/재고없음) 계산 기준이 왜 이렇게 되는지 확인할 때
- 그룹화(같은 품명 합산) 동작을 수정하거나 디버그할 때

## 중요한 내용
- `useInventoryListData(search, filters)` — 메인 export. `search` 문자열과 `InventoryFilters`를 받아 `UseInventoryListDataResult` 반환
- `InventoryFilters` — `department`, `kpi`(OK/LOW/ZERO), `itemType`(RAW/SEMI/FIXED), `modelSlot`(null=공용 품목만), `grouped`(이름 기준 합산 여부)
- `InventoryDisplayRow` — `key`, `item`, `quantity`, `available`, `count` 포함. 그룹화 시 count > 1
- `InventoryListTotals` — `count`(전체 행 수), `normal`, `low`, `zero` 개수
- KPI 필터: `available_quantity`가 있으면 우선 사용, 없으면 `quantity` fallback
- 그룹화: `item_name.trim().toLowerCase()` 키 기준으로 수량 합산
- `useDeferredValue(search)` 로 검색 입력 디바운스 처리

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/hooks/useItems.ts]] — 실제 API 호출 훅. `search`·`department`를 넘겨 품목 목록·페이지네이션 제공
- [[ERP/frontend/lib/mes/inventory.ts]] — `getStockState(available, min)` 함수. totals 집계 시 "정상"/"부족" 판정에 사용
- [[ERP/frontend/lib/api.ts]] — `Item` 타입 정의
