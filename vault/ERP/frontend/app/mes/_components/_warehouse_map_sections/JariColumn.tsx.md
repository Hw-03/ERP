# JariColumn.tsx

## 이 파일은 뭐예요?
자리(jari) 1칸의 박스 스택을 flex 비율 높이로 시각화하는 원자 컴포넌트입니다. 정면도(`scale="front"`)와 줄확대(`scale="row"`) 두 가지 스케일을 지원하며, 편집 모드에서는 드래그&드롭으로 박스를 다른 자리로 이동하거나 스택 중간에 끼워넣을 수 있습니다.

## 언제 보나요?
- 정면도(`FrontStage`)나 줄확대(`RowStage`)에서 개별 자리 렌더를 변경할 때
- 박스 색상·텍스트 표시 방식이나 드래그 힌트(파란색 인셋 테두리) 로직을 수정할 때

## 중요한 내용
- export: `JariColumn` (named export)
- props:
  - `boxes: WarehouseBox[]` — 이 자리의 박스 목록
  - `scale: "front" | "row"` — 정면도 vs 줄확대 렌더 모드
  - `matchQuery?: string` — 검색어; 일치하는 박스를 `styles.boxHit`으로 강조
  - `draggable?: boolean` — 편집 모드 드래그 활성화
  - `onBoxDragStart?(boxId)` — 드래그 시작 콜백
  - `onBoxDrop?(targetBoxId, place: "above"|"below")` — 스택 중간 삽입 콜백
- `frontName(name)` — 정면도에서 모델코드 접두사(DX3000 등)를 제거해 핵심 품명만 표시하는 로컬 함수
- 빈 단위(empty)는 점선 윤곽으로 "비었음"을 형태로 표현; 채운 박스는 부서색 28% 틴트 + 좌측 4px 바
- `dropHint` state — 드롭 위치(above/below)에 따라 파란색 inset shadow 렌더

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_map_sections/helpers.ts]] — SIZE_UNIT, SIZE_LABEL, JARI_CAPACITY, boxColor, stackUnits
- [[ERP/frontend/app/mes/_components/_warehouse_map_sections/WarehouseStages.tsx]] — JariColumn을 FrontStage·RowStage 내부에서 사용
- [[ERP/frontend/lib/api/warehouse-map]] — WarehouseBox 타입
- [[ERP/frontend/lib/ui/📁_ui]] — Tooltip 컴포넌트
- [[ERP/frontend/lib/mes/color.ts]] — LEGACY_COLORS
- `warehouseMap.module.css` — `boxHover`, `boxHit` 클래스
