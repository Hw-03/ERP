---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_map_sections/warehouseMap.module.css"
importance: normal
layer: frontend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# warehouseMap.module.css — 창고 지도의 hover·강조·전환 애니메이션

## 이 파일은 무엇을 책임지나

창고 지도 화면에서 손이 닿았을 때의 반응(hover)과 강조 효과만 담은 스코프 CSS입니다. 색은 직접 적지 않고 globals.css 토큰(`var(--c-blue)` 등)을 가져다 씁니다. CSS 모듈이라 클래스 이름이 이 화면에만 적용됩니다.

## 업무 흐름에서의 의미

창고 담당자가 앵글·칸·박스에 마우스를 올릴 때 살짝 떠오르거나 테두리가 생겨 "지금 어디를 가리키는지" 알려 줍니다. 검색으로 위치를 찾으면 그 자리가 파란 펄스로 두 번 깜빡여 시선을 끌어 줍니다. 단계가 바뀔 때는 오른쪽에서 부드럽게 들어오는 전환 효과가 붙습니다.

## 언제 보면 좋나

- hover 강조나 펄스 애니메이션의 색·세기를 조정할 때
- 단계 전환 애니메이션을 바꾸거나 끄고 싶을 때
- 모션 최소화 설정 대응을 확인할 때

## 중요한 내용

- `.angleBlock:hover` — 평면도 앵글이 살짝 커지고(`scale(1.03)`) 파란 그림자가 생깁니다.
- `.boxHover:hover` — 박스 칸에 파란 외곽선 + 밝기 강조.
- `.hit` + `@keyframes wmPulse` — 검색으로 찾은 자리를 파란 펄스로 2회 깜빡임.
- `.miniCell:hover` — 줄 확대 미니맵 점이 커집니다.
- `.stageEnter` + `@keyframes wmStageEnter` — 단계 전환 시 오른쪽에서 슬라이드 인.
- `.crumb` — 브레드크럼 링크 hover 밑줄.
- `@media (prefers-reduced-motion: reduce)` — 모션 최소화 사용자에게는 펄스 애니메이션을 끕니다(접근성).

## 연결되는 파일

### 먼저 같이 볼 파일

- [[ERP/frontend/app/legacy/_components/_warehouse_map_sections/WarehouseStages.tsx]] — `angleBlock`·`cell`·`hit`·`miniCell`·`layerRow` 클래스를 붙이는 곳.
- [[ERP/frontend/app/legacy/_components/_warehouse_map_sections/JariColumn.tsx]] — `boxHover` 사용.
- [[ERP/frontend/app/legacy/_components/DesktopWarehouseMapView.tsx]] — `stageEnter`·`crumb` 사용.

## 조심할 점

색은 반드시 globals.css 변수(`var(--c-blue)` 등)를 쓰세요. 색값을 직접 적으면 라이트/다크 테마와 어긋납니다.
