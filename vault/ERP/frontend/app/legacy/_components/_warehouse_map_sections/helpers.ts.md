---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_map_sections/helpers.ts"
importance: normal
layer: frontend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# helpers.ts — 창고 지도의 그림 없는 순수 계산 모음

## 이 파일은 무엇을 책임지나

화면을 그리지 않고 계산만 하는 작은 함수·상수 모음입니다. 박스를 칸 단위로 묶고, 자리별 스택으로 나누고, 박스/칸의 대표 부서색을 정하는 일을 담당합니다. 그림 부품들이 이 계산 결과를 받아 화면을 그립니다.

## 업무 흐름에서의 의미

박스 색이 무슨 색으로 나오는지, 빈 자리가 어떻게 표시되는지, 검색 결과가 어느 칸으로 묶이는지가 전부 이 파일의 계산에서 결정됩니다. 특히 박스/칸 색은 "그 박스에 든 품목들의 수량 가중 최빈 부서색"이라, 색 규칙을 바꾸려면 여기 한 곳만 고치면 됩니다.

## 언제 보면 좋나

- 박스 색이 기대와 다를 때 (`dominantColor` / `boxColor` / `cellColor`)
- 박스 크기 비율·자리 용량을 바꿀 때 (`SIZE_UNIT`, `JARI_CAPACITY`)
- 자리별 박스 정렬 순서가 이상할 때 (`jariStacks` 의 `stack_order` 정렬)

## 중요한 내용

- `SIZE_UNIT` (대3·중2·소1) — 박스 높이 비율이자 자리 용량 단위.
- `SIZE_LABEL` (대/중/소), `JARI_CAPACITY` (3) — 화면 표기와 자리 한도.
- `cellKey(a, r, l)` — "앵글-줄-층" 문자열 키. 화면 전체에서 칸을 가리키는 공통 열쇠.
- `buildCellIndex(boxes)` — 박스 목록을 칸 키로 묶은 `Map`. 본체가 한 번 만들어 두고 곳곳에서 재사용.
- `jariStacks(cellBoxes, jarisPerCell)` — 칸의 박스를 자리(jari) 인덱스별로 나누고, 각 스택을 `stack_order` 오름차순(아래→위)으로 정렬.
- `dominantColor(items)` — 품목들의 부서를 수량 가중으로 집계해 최빈 부서의 색을 반환. 색이 비면 `getDepartmentFallbackColor` 로 대체.
- `boxColor` / `cellColor` — 박스 1개 / 칸 전체의 대표색.
- `cellOccupied(cellBoxes)` — 칸에 박스가 있는지 여부(미니맵 점 채움 판단).

## 연결되는 파일

### 먼저 같이 볼 파일

- [[ERP/frontend/app/legacy/_components/_warehouse_map_sections/JariColumn.tsx]] — `SIZE_UNIT`·`boxColor`·`stackUnits` 사용.
- [[ERP/frontend/app/legacy/_components/_warehouse_map_sections/WarehouseStages.tsx]] — `cellKey`·`jariStacks`·`cellColor`·`cellOccupied` 사용.
- [[ERP/frontend/app/legacy/_components/DesktopWarehouseMapView.tsx]] — `buildCellIndex`·`cellColor`·`cellKey` 로 색인·검색을 구성.

## 조심할 점

- 부서색의 단일 출처는 `dominantColor` 입니다. 색 규칙을 바꿀 때 그림 부품 여러 곳을 고치지 말고 여기만 고치세요.
- `jariStacks` 는 `b.jari_index` 가 0 이상 `jarisPerCell` 미만인 박스만 담습니다. 범위 밖 인덱스는 조용히 무시되니 데이터가 안 보이면 인덱스 범위부터 의심하세요.

## 핵심 발췌

```ts
export const SIZE_UNIT: Record<string, number> = { LARGE: 3, MEDIUM: 2, SMALL: 1 };
export const JARI_CAPACITY = 3;
export const cellKey = (a: number, r: number, l: number) => `${a}-${r}-${l}`;
// dominantColor: 품목들의 부서를 수량 가중 최빈으로 집계 → 그 부서색
```
