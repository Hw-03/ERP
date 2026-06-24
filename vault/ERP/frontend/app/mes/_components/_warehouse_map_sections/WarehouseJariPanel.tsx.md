# WarehouseJariPanel.tsx

## 이 파일은 뭐예요?
창고 지도에서 특정 칸(앵글·열·층)을 클릭했을 때 슬라이드 패널 내부에 표시되는 상세 내용 컴포넌트입니다. 해당 칸의 자리별 박스 스택을 나열하고, 편집 모드일 때는 박스 넣기·편집·빼기 버튼을 함께 렌더합니다.

## 언제 보나요?
- 창고 지도 정면도·줄확대에서 셀을 클릭하면 열리는 SlidePanel 내용 영역을 수정할 때
- 자리별 박스 스택 표시 방식이나 "박스 넣기/편집/빼기" 버튼 동작을 바꿀 때

## 중요한 내용
- export: `WarehouseJariPanel` (named export)
- props:
  - `angle: WarehouseAngle`, `row: number`, `layer: number` — 위치 지정
  - `cellIndex: Map<string, WarehouseBox[]>` — 전체 셀 인덱스(부모가 내려줌)
  - `matchQuery?: string` — 검색어; 일치 품목명을 파란색·bold 강조
  - `editable?: boolean` — 편집 모드 여부 (기본 false = 보기 전용)
  - `busy?: boolean` — 비동기 작업 중 버튼 비활성
  - `onRequestAddBox?(jariIndex, remaining)` — 빈 자리의 "박스 넣기" 클릭 콜백
  - `onRequestEditBox?(box)` — 기존 박스 연필 아이콘 클릭 콜백
  - `onDeleteBox?(boxId)` — 박스 빼기(Trash2) 클릭 콜백; `Promise<void>` 반환
- `JARI_CAPACITY`(3) 기준으로 자리별 잔여 용량을 계산해 "남은 N칸" 표시
- 비어있는 칸은 editable 여부에 따라 "이 칸은 비어있습니다" 메시지 또는 빈 자리 표시

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_map_sections/helpers.ts]] — JARI_CAPACITY, SIZE_LABEL, boxColor, cellKey, jariStacks, rowLabel, stackUnits
- [[ERP/frontend/lib/api/warehouse-map]] — WarehouseAngle, WarehouseBox 타입
- [[ERP/frontend/lib/mes/color.ts]] — LEGACY_COLORS 디자인 토큰
