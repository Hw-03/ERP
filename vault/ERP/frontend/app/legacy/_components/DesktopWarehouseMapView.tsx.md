---
type: file-explanation
source_path: "frontend/app/legacy/_components/DesktopWarehouseMapView.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# DesktopWarehouseMapView.tsx — 창고 지도 화면 전체를 조립하는 본체

## 이 파일은 무엇을 책임지나

창고 안의 물건이 "어느 앵글(선반)·몇 줄·몇 층·어느 자리"에 있는지를 그림으로 보여주는 화면입니다. 데스크톱 화면에서 "창고 지도" 탭을 누르면 이 컴포넌트가 통째로 뜹니다.

이 파일이 직접 하는 일:

- 서버에서 창고 지도 데이터(앵글 목록 + 박스 목록)를 한 번에 받아옵니다.
- 지금 어느 단계를 보고 있는지(`floor` 평면도 → `front` 정면도 → `row` 줄 확대) 상태를 들고 있습니다.
- 품목명·코드 검색을 처리하고, 찾은 위치로 화면을 자동 이동시킵니다.
- 브라우저 뒤로가기 버튼으로 한 단계씩 되돌아갈 수 있게 history를 쌓습니다.
- 칸을 클릭하면 오른쪽에서 상세 패널(슬라이드)을 엽니다.

실제 그림 그리기(평면도·정면도·줄 확대·박스 칸)는 `_warehouse_map_sections/` 안의 부품들에게 맡기고, 이 파일은 "지휘자" 역할만 합니다.

## 업무 흐름에서의 의미

창고 담당자가 "이 품목 어디 있지?" 할 때 쓰는 화면입니다. 현장에서는 보통 이렇게 움직입니다.

1. **평면도(floor)** — 창고를 위에서 내려다본 그림. 앵글(선반) 9개가 입구 기준으로 배치돼 있습니다. 원하는 앵글을 클릭.
2. **정면도(front)** — 그 앵글을 정면에서 본 격자. 가로가 "줄", 세로가 "층"입니다. 각 칸 안에 박스가 색으로 표시됩니다. 원하는 칸을 클릭.
3. **줄 확대(row)** — 한 줄을 크게 펼쳐 층별·자리별로 어떤 박스가 쌓였는지 봅니다.
4. **상세 패널** — 칸을 클릭하면 오른쪽에서 슬라이드로 열리며, 자리별 박스와 품목·수량을 글자로 보여줍니다.

검색창에 품목명이나 코드를 치면 위치를 바로 찾아 줄 확대 + 상세 패널까지 한 번에 띄워 줍니다.

## 언제 보면 좋나

- 창고 지도 화면의 전체 구조(단계 전환·검색·뒤로가기)를 이해하고 싶을 때
- 검색이 이상하게 동작하거나, 뒤로가기가 한 단계씩 안 돌아갈 때 원인을 찾을 때
- 새 단계나 새 버튼을 추가하기 전에 어디에 끼워야 하는지 볼 때

## 중요한 내용

- `type Stage = "floor" | "front" | "row"` — 화면 단계. 이 세 값이 화면 전체 흐름을 결정합니다.
- `useEffect` 로드 블록 — `warehouseMapApi.getMap()` 으로 지도 데이터를 받습니다. 실패하면 에러 문구를 화면에 보여주고 상단 상태바에도 알립니다.
- `buildCellIndex(map.boxes)` — 박스들을 "앵글-줄-층" 키로 묶은 색인. 화면 곳곳에서 칸 단위로 박스를 빨리 찾으려고 미리 만들어 둡니다.
- `runSearch(q)` — 품목명/코드로 박스를 훑어 찾은 위치를 모읍니다. 1곳이면 바로 이동(`navigateToHit`), 여러 곳이면 드롭다운 목록으로 보여 줍니다.
- `openAngle` / `openCell` / `openLayer` — 단계 전환 함수. 전환할 때마다 `window.history.pushState` 로 브라우저 history를 쌓아 뒤로가기를 지원합니다(`wmDepthRef` 로 깊이 관리).
- `onPop` (popstate 처리) — 브라우저 뒤로/앞으로 갈 때 history에 저장해 둔 단계 정보를 복원합니다.
- 키보드: `/` 키로 검색창 포커스, `Esc` 로 패널 닫기/검색 지우기.
- 하단에서 `<SlidePanel>` 안에 `WarehouseJariPanel` 을 띄워 칸 상세를 보여 줍니다.

## 연결되는 파일

### 먼저 같이 볼 파일

- [[ERP/frontend/app/legacy/_components/_warehouse_map_sections/📁__warehouse_map_sections]] — 이 화면이 쓰는 그림 부품(평면도·정면도·줄 확대·박스 칸·헬퍼·CSS)이 모두 여기 있습니다.
- [[ERP/frontend/app/legacy/_components/_warehouse_map_sections/WarehouseStages.tsx]] — 단계별 그림(FloorStage/FrontStage/RowStage) 본체.
- [[ERP/frontend/app/legacy/_components/_warehouse_map_sections/WarehouseJariPanel.tsx]] — 오른쪽 슬라이드 상세 패널.
- [[ERP/frontend/app/legacy/_components/_warehouse_map_sections/helpers.ts]] — 박스 색인·부서색·자리 스택 계산 등 순수 계산.
- [[ERP/frontend/app/legacy/_components/DesktopLegacyShell.tsx]] — `activeTab === "warehouseMap"` 일 때 이 화면을 띄우는 상위 셸.

## 조심할 점

- 뒤로가기는 단순 `setStage` 가 아니라 브라우저 history(`pushState`/`popstate`)에 묶여 있습니다. 단계 전환 코드를 고칠 때는 history 깊이(`wmDepthRef`)도 함께 맞춰야 뒤로가기가 어긋나지 않습니다.
- 검색은 화면에 이미 받아 둔 박스 데이터를 클라이언트에서 훑는 방식입니다(서버 재호출 아님). 지도 데이터가 안 들어오면 검색도 빈 결과가 됩니다.
- 색·여백은 모두 `LEGACY_COLORS` 토큰과 CSS 변수를 씁니다. 색을 직접 하드코딩하지 마세요.

## 핵심 발췌

```tsx
type Stage = "floor" | "front" | "row";

function openAngle(a: WarehouseAngle) {
  setCurAngle(a);
  setStage("front");
  setPanel(null);
  wmDepthRef.current += 1;
  window.history.pushState(
    { wm: { stage: "front", angleId: a.id }, wmDepth: wmDepthRef.current }, "",
  );
}
```
