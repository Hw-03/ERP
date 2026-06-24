# WarehouseStages.tsx

## 이 파일은 뭐ععو?
창고 지도의 세 가지 뷰 스테이지를 각각 named export로 제공하는 파일입니다. 평면도(`FloorStage`), 정면도(`FrontStage`), 줄확대(`RowStage`) 세 컴포넌트가 한 파일에 있으며, 부모 컴포넌트(창고 지도 메인)가 현재 단계에 따라 하나를 선택해 렌더합니다.

## 언제 보나요?
- 창고 평면도(앵글 배치도)·정면도(셀 그리드)·줄확대(자리별 스택 테이블)의 레이아웃이나 상호작용을 수정할 때
- 드래그&드롭 이동/중간삽입, 미니맵 클릭 내비게이션, pulse 애니메이션 등을 변경할 때

## 중요한 내용
- exports: `FloorStage`, `FrontStage`, `RowStage` (named)

### FloorStage
- 880×300 좌표계 기준 평면도. 컨테이너 크기에 맞게 `ResizeObserver`로 `scale` 자동 조정
- props: `angles`, `hitAngles: Map<number, number>`, `pulseAngleId`, `onAngleClick`
- 검색 히트 앵글에는 파란 배지, `pulseAngleId`에는 `styles.hit` 애니메이션

### FrontStage
- 단일 앵글의 정면 그리드: 줄 헤더(열) + 층 라벨 + 셀
- props: `angle`, `cellIndex`, `pulseCellKey`, `showSlotLabels`, `onCellClick`
- `ResizeObserver`로 `cellH`(셀 높이) 자동 계산; `showSlotLabels` 시 빈 자리에 번호 표시

### RowStage
- 특정 열(row)의 줄확대: 상단 미니맵 + 층별 자리 테이블
- props: `angle`, `curRow`, `selectedLayer`, `cellIndex`, `pulseLayer`, `matchQuery`, `editable`, `onMoveBox`, `onInsertBox`, `onRowChange`, `onLayerClick`, `onRowAndLayerChange`
- 편집 모드: 자리 영역 DragOver/Drop으로 `onMoveBox` 호출; `JariColumn`의 `onBoxDrop`으로 `onInsertBox` 호출

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_map_sections/JariColumn.tsx]] — FrontStage·RowStage에서 자리 렌더에 사용
- [[ERP/frontend/app/mes/_components/_warehouse_map_sections/helpers.ts]] — cellColor, cellKey, cellOccupied, jariStacks, rowLabel
- [[ERP/frontend/lib/api/warehouse-map]] — WarehouseAngle, WarehouseBox 타입
- [[ERP/frontend/lib/mes/color.ts]] — LEGACY_COLORS
- `warehouseMap.module.css` — `angleBlock`, `cell`, `hit`, `layerRow`, `miniCell` 클래스
