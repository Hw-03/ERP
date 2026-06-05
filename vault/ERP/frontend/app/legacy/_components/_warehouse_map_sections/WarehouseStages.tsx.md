---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_map_sections/WarehouseStages.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# WarehouseStages.tsx — 창고 지도의 세 단계 화면(평면도·정면도·줄 확대)

## 이 파일은 무엇을 책임지나

창고 지도의 세 가지 보기 단계를 그리는 컴포넌트 3개가 한 파일에 모여 있습니다.

- `FloorStage` — **평면도**. 창고를 위에서 내려다본 그림. 앵글(선반) 9개를 입구 기준 좌표에 배치합니다.
- `FrontStage` — **정면도**. 한 앵글을 정면에서 본 격자. 가로=줄, 세로=층. 각 칸에 박스가 색으로 들어갑니다.
- `RowStage` — **줄 확대**. 한 줄을 크게 펼쳐 위쪽 미니맵 + 층별·자리별 박스 테이블로 보여 줍니다.

본체([[ERP/frontend/app/legacy/_components/DesktopWarehouseMapView.tsx]])가 현재 단계에 맞는 컴포넌트를 골라 여기에 데이터를 넘겨 주면, 이 파일이 실제 그림을 그립니다.

## 업무 흐름에서의 의미

창고 담당자가 물건을 찾아 들어가는 "줌인" 흐름 그 자체입니다. 평면도에서 선반을 고르고(FloorStage) → 정면도에서 줄·층 격자를 보고(FrontStage) → 줄을 확대해 박스 스택을 확인(RowStage)합니다. 검색으로 찾은 위치는 해당 단계에 파란 강조(펄스)로 표시돼 눈에 띕니다.

## 언제 보면 좋나

- 정면도의 칸 크기나 줄/층 정렬이 깨질 때 (`FrontStage` 의 `cellH` fit 계산)
- 평면도에서 앵글 위치가 어긋날 때 (`FloorStage` 의 880×300 좌표계 + scale)
- 줄 확대 미니맵이나 층 테이블 모양을 바꿀 때 (`RowStage`)

## 중요한 내용

- `FloorStage` — 880×300 고정 좌표계에 앵글을 절대 위치(`pos_x`/`pos_y`/`width`/`height`)로 깔고, `ResizeObserver` 로 카드 크기에 맞춰 전체를 `scale` 합니다. 검색에 걸린 앵글에는 우상단에 개수 배지를 띄웁니다.
- `FrontStage` — 줄(가로)·층(세로) 격자. 화면 높이에 맞춰 칸 높이(`cellH`)를 계산해 스크롤 없이 한 화면에 담으려 합니다. 각 칸 안에 자리(jari)별 `JariColumn` 을 나란히 넣습니다.
- `RowStage` — 위쪽에 줄 전체 미니맵(줄=열, 층=행)을 두어 현재 줄을 파란 테두리로 표시하고, 아래에 층별 자리 테이블을 높이 가득 펼칩니다.
- 세 단계 모두 칸 클릭(`onAngleClick`/`onCellClick`/`onLayerClick`)을 본체로 올려보내 단계 전환·패널 열기를 맡깁니다.
- `pulseAngleId`/`pulseCellKey`/`pulseLayer` 로 검색 강조 위치를 받아 CSS `hit` 클래스를 붙입니다.

## 연결되는 파일

### 먼저 같이 볼 파일

- [[ERP/frontend/app/legacy/_components/DesktopWarehouseMapView.tsx]] — 단계를 고르고 데이터를 넘겨 주는 본체.
- [[ERP/frontend/app/legacy/_components/_warehouse_map_sections/JariColumn.tsx]] — 정면도·줄 확대 칸 안에 들어가는 박스 한 칸.
- [[ERP/frontend/app/legacy/_components/_warehouse_map_sections/helpers.ts]] — `cellKey`·`jariStacks`·`cellColor`·`cellOccupied` 등 격자가 쓰는 계산.
- [[ERP/frontend/app/legacy/_components/_warehouse_map_sections/warehouseMap.module.css]] — hover·펄스 강조 클래스.

## 조심할 점

- `FrontStage` 의 `cellH` 계산식은 제목·줄헤더·gap·패딩 높이를 빼는 방식이라, 위쪽 여백을 바꾸면 이 숫자도 같이 맞춰야 칸이 화면을 벗어나지 않습니다.
- 평면도 좌표(880×300)는 앵글 데이터의 `pos_x`/`pos_y` 와 한 쌍입니다. 좌표계 크기를 바꾸면 서버 쪽 앵글 좌표도 같은 기준이어야 합니다.

## 핵심 발췌

```tsx
// FrontStage — 화면 높이에 맞춰 칸 높이 계산 (스크롤 없이 한 화면)
const availH = el.clientHeight - 28 - 22 - angle.layers * 6 - 22;
setCellH(Math.max(40, Math.floor(availH / angle.layers)));
```
