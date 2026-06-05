---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_map_sections/WarehouseJariPanel.tsx"
importance: normal
layer: frontend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# WarehouseJariPanel.tsx — 칸을 클릭하면 오른쪽에 뜨는 상세 패널

## 이 파일은 무엇을 책임지나

창고 지도에서 한 칸(앵글·줄·층)을 클릭했을 때 오른쪽에서 슬라이드로 열리는 상세 내용을 그립니다. 그림이 아니라 "자리별로 어떤 박스가, 그 박스에 어떤 품목이 몇 개 들어 있는지"를 글자·칩으로 정확히 보여 주는 패널입니다.

## 업무 흐름에서의 의미

정면도나 줄 확대에서 칸을 색·모양으로 대충 파악했다면, 이 패널은 그 칸의 정확한 내용을 확인하는 곳입니다. 자리(jari) 1·2·3 순서로 나눠, 각 자리에 쌓인 박스(대/중/소형)와 그 안의 품목·수량을 칩으로 나열합니다. 검색해서 들어온 경우, 검색어와 일치하는 품목 칩은 파란색으로 강조돼 어떤 품목 때문에 여기로 왔는지 바로 보입니다.

## 언제 보면 좋나

- 칸 상세 패널의 내용·레이아웃을 바꾸고 싶을 때
- 검색 강조(파란 칩)가 안 맞을 때 (`matchQuery` 매칭)
- 빈 자리/빈 칸 표시 문구를 조정할 때

## 중요한 내용

- `jariStacks(cellIndex.get(cellKey(...)), angle.jaris_per_cell)` — 그 칸의 박스를 자리별 스택으로 나눠 받습니다.
- 칸 전체가 비면 "이 칸은 비어있습니다", 자리만 비면 "비어있음"을 보여 줍니다.
- 박스는 `[...boxes].reverse()` 로 위에서부터, 크기 칩(`SIZE_LABEL[box.size] + "형 박스"`)과 함께 그립니다.
- 품목 칩: `matchQuery`(검색어)와 품목명이 겹치면 파란 테두리·굵은 글씨로 강조합니다.
- 색은 `boxColor(box)` 가 준 부서색을 박스 카드 왼쪽 3px 바로 칠합니다.

## 연결되는 파일

### 먼저 같이 볼 파일

- [[ERP/frontend/app/legacy/_components/DesktopWarehouseMapView.tsx]] — `SlidePanel` 안에 이 패널을 띄우고 `matchQuery` 를 넘겨 줍니다.
- [[ERP/frontend/app/legacy/_components/_warehouse_map_sections/helpers.ts]] — `cellKey`·`jariStacks`·`boxColor`·`SIZE_LABEL` 출처.

## 핵심 발췌

```tsx
const stacks = jariStacks(cellIndex.get(cellKey(angle.id, row, layer)), angle.jaris_per_cell);
const anyContent = stacks.some((s) => s.length > 0);
const lq = (matchQuery || "").toLowerCase();
// 검색어와 겹치는 품목 칩은 파란색으로 강조
```
