---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_map_sections/JariColumn.tsx"
importance: normal
layer: frontend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# JariColumn.tsx — 자리(jari) 한 칸의 박스 스택을 그리는 가장 작은 부품

## 이 파일은 무엇을 책임지나

창고 지도에서 "자리(jari) 1칸"을 세로 스택으로 그립니다. 한 자리에는 박스가 아래에서 위로 쌓이는데, 박스 크기(대·중·소)에 따라 높이 비율을 다르게 줍니다. 빈 공간은 점선 윤곽으로 "비었음"을 모양으로 표현합니다.

같은 부품을 두 곳에서 다른 모드로 씁니다.

- `scale="front"` — **정면도**용. 칸이 좁아 박스마다 품목코드(없으면 품명)만 작게 표기.
- `scale="row"` — **줄 확대**용. 칸이 넓어 크기 칩(대/중/소) + 품목명 + 수량을 한 줄로 표기.

## 업무 흐름에서의 의미

창고 담당자가 정면도나 줄 확대에서 보는 "박스 한 칸"이 바로 이 부품입니다. 색은 그 박스의 대표 부서색이라 어느 공정 물건인지 색으로 구분되고, 채워진 정도(스택 높이)로 자리가 얼마나 찼는지 한눈에 보입니다. 품목명이 잘리면 마우스를 올렸을 때 그 박스에 든 전체 품목 목록이 툴팁으로 뜹니다.

## 언제 보면 좋나

- 박스 칸의 글자·색·높이 비율을 바꾸고 싶을 때
- 정면도에서 품목코드가 잘리거나 너무 많이 표시될 때(`frontCap` 로직)
- 빈 자리 표시(점선)를 조정할 때

## 중요한 내용

- `stackUnits(boxes)` 로 자리에 쓰인 용량을 계산하고, `JARI_CAPACITY`(3)에서 빼 빈 칸 높이를 정합니다.
- 박스는 `[...boxes].reverse()` 로 위에서부터 그립니다(아래가 먼저 쌓인 박스).
- `flex: SIZE_UNIT[box.size]` — 대3·중2·소1 비율로 박스 높이를 정합니다.
- 박스 색: `boxColor(box)` 가 준 부서색을 28% 틴트 배경 + 좌측 4px 바로 칠합니다.
- `frontName(name)` — 정면도 한정으로 선두 모델코드 토큰("DX3000" 등)을 떼어 좁은 칸에서 핵심 품명을 보이게 합니다. 코드가 있으면 코드를 우선 표기.
- 품목이 있으면 커스텀 `Tooltip` 으로 전 품목·수량 목록을 보여 줍니다(브라우저 기본 title 대신).

## 연결되는 파일

### 먼저 같이 볼 파일

- [[ERP/frontend/app/legacy/_components/_warehouse_map_sections/helpers.ts]] — `SIZE_UNIT`·`SIZE_LABEL`·`JARI_CAPACITY`·`boxColor`·`stackUnits` 가 모두 여기서 옵니다.
- [[ERP/frontend/app/legacy/_components/_warehouse_map_sections/WarehouseStages.tsx]] — 이 부품을 정면도·줄 확대 칸 안에 배치하는 곳.

## 조심할 점

- `SIZE_UNIT` 은 박스 높이 비율과 자리 용량(`JARI_CAPACITY`)을 동시에 결정합니다. 한쪽만 바꾸면 빈 칸 계산이 어긋납니다.
- 색은 `LEGACY_COLORS` 토큰을 씁니다. 직접 색을 적지 마세요.

## 핵심 발췌

```tsx
const used = stackUnits(boxes);
const empty = JARI_CAPACITY - used;
// 빈 단위는 점선 윤곽(투명), 채운 박스는 부서색 28% 틴트 + 좌측 4px 바
```
