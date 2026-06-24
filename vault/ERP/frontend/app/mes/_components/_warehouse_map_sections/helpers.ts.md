# helpers.ts

## 이 파일은 뭐예요?
창고 지도 기능 전반에서 쓰는 순수 헬퍼 모음입니다. 박스 스택 계산, 부서 대표색 집계, 셀 인덱스 빌드 등 화면 표시를 위한 데이터 가공 로직을 담당합니다.

## 언제 보나요?
- 창고 지도 컴포넌트(WarehouseJariPanel, JariColumn, WarehouseStages 등)에서 `cellKey`, `jariStacks`, `boxColor`, `stackUnits` 등을 import 할 때
- 박스 크기 단위(`SIZE_UNIT`, `SIZE_LABEL`, `JARI_CAPACITY`)나 자리 라벨(`rowLabel`) 기준을 확인할 때

## 중요한 내용
- `SIZE_UNIT` — 박스 크기별 단위 수: `LARGE: 3`, `MEDIUM: 2`, `SMALL: 1`
- `SIZE_LABEL` — 박스 크기 한글 라벨: `LARGE: "대"`, `MEDIUM: "중"`, `SMALL: "소"`
- `JARI_CAPACITY = 3` — 자리 1칸의 최대 용량(단위 합산 기준)
- `cellKey(a, r, l)` — 앵글ID·열번호·층번호를 `"a-r-l"` 문자열 키로 합침
- `rowLabel(n)` — 열 번호를 알파벳으로 변환 (1→"A", 2→"B" …)
- `buildCellIndex(boxes)` — `WarehouseBox[]`를 `Map<string, WarehouseBox[]>` 셀 인덱스로 변환
- `jariStacks(cellBoxes, jarisPerCell)` — 셀 내 박스를 자리(jari) 인덱스별 스택 배열로 분류 (stack_order 오름차순 정렬)
- `stackUnits(boxes)` — 박스 배열의 SIZE_UNIT 합계
- `dominantColor(items)` — 품목 목록에서 수량 가중 최빈 부서 색상 반환
- `boxColor(box)` / `cellColor(cellBoxes)` — 박스·셀 단위 대표 부서색 (미니맵·검색 강조용)
- `cellOccupied(cellBoxes)` — 셀에 박스 존재 여부

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_map_sections/WarehouseJariPanel.tsx]] — cellKey, jariStacks, stackUnits, SIZE_LABEL, JARI_CAPACITY, rowLabel, boxColor 사용
- [[ERP/frontend/app/mes/_components/_warehouse_map_sections/JariColumn.tsx]] — SIZE_UNIT, SIZE_LABEL, JARI_CAPACITY, boxColor, stackUnits 사용
- [[ERP/frontend/app/mes/_components/_warehouse_map_sections/WarehouseStages.tsx]] — cellKey, jariStacks, cellColor, cellOccupied, rowLabel 사용
- [[ERP/frontend/app/mes/_components/_warehouse_map_sections/AddBoxScreen.tsx]] — rowLabel, SIZE_LABEL, SIZE_UNIT 사용
- [[ERP/frontend/lib/api/warehouse-map]] — WarehouseBox, WarehouseBoxItem 타입 정의
- [[ERP/frontend/lib/mes-department.ts]] — getDepartmentFallbackColor (부서 기본색 fallback)
