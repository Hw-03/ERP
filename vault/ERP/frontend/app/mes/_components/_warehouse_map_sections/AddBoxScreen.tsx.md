# AddBoxScreen.tsx

## 이 파일은 뭐예요?
창고 지도 박스 관리 탭에서 "박스 넣기" 또는 기존 박스 편집 시 전환되는 전체화면 서브스크린 컴포넌트입니다. 박스 크기 선택 → 품목 검색·선택 → 수량 입력 → 배치/저장을 한 화면에서 처리합니다.

## 언제 보나요?
- 자리에 새 박스를 넣거나(박스 넣기) 기존 박스 품목·수량을 수정(박스 편집)하는 흐름을 변경할 때
- 수량 초과 경고(`anyExceeds`, `getAvailable`) 또는 박스 크기 용량 초과(`overflow`) 처리를 수정할 때

## 중요한 내용
- export: `AddBoxScreen` (named export)
- props:
  - `angle, row, layer, jariIndex, remaining` — 대상 위치 정보
  - `editBox?: WarehouseBox` — 전달 시 편집 모드(size 변경 불가, 기존 품목 미리 로드)
  - `items: Item[]` — 전체 품목 목록 (부모가 내려줌)
  - `busy: boolean` — 제출 중 버튼 비활성
  - `onSubmit({ jariIndex, size, lines })` — 확정 콜백; `Promise<void>`
  - `onCancel()` — 뒤로 가기 콜백
- `cart: Map<string, number>` — 선택 품목 id → 수량 state
- `reconcileCache` — `warehouseMapApi.reconcile(itemId)` 결과를 캐시; 선택한 품목의 "창고 여유 재고"를 비동기 조회해 초과 여부 경고
- 편집 모드: `getAvailable`에서 `placed_total`에 현재 박스의 기존 수량을 빼 실제 여유량 계산
- `SIZE_OPTS` — `SMALL(1)/MEDIUM(2)/LARGE(3)` 크기 옵션; `remaining` 초과 크기는 비활성

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_map_sections/helpers.ts]] — rowLabel, SIZE_LABEL, SIZE_UNIT
- [[ERP/frontend/lib/api/warehouse-map]] — warehouseMapApi.reconcile, BoxSize, ReconcileRow, WarehouseAngle, WarehouseBox
- [[ERP/frontend/lib/api.ts]] — Item 타입
- [[ERP/frontend/lib/ui/Button.tsx]] — Button 컴포넌트
- [[ERP/frontend/lib/mes/color.ts]] — LEGACY_COLORS
