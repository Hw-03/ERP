---
type: folder-note
source_path: "frontend/app/legacy/_components/_warehouse_map_sections"
importance: important
layer: frontend
graph: hub
updated: 2026-06-05
project: DEXCOWIN MES
---

# 📁 _warehouse_map_sections

## 이 폴더는 무엇을 위한 곳인가

"창고 지도" 화면을 그리는 부품들이 모여 있는 곳입니다. 본체 화면([[ERP/frontend/app/legacy/_components/DesktopWarehouseMapView.tsx]])이 데이터와 흐름을 지휘하고, 실제 그림(평면도·정면도·줄 확대·박스 칸)은 이 폴더의 부품들이 그립니다.

- **그림 부품**: 단계별 화면(`WarehouseStages.tsx`), 박스 한 칸(`JariColumn.tsx`), 오른쪽 상세 패널(`WarehouseJariPanel.tsx`)
- **계산 부품**: 박스 색인·부서색·자리 스택 계산(`helpers.ts`)
- **모양 부품**: hover·강조 애니메이션 CSS(`warehouseMap.module.css`)

## 현장 업무와의 관계

창고 담당자가 "이 품목이 어느 선반 몇 줄 몇 층 어느 자리에 있나"를 눈으로 찾는 화면을 구성합니다. 평면도에서 선반을 고르고, 정면도에서 줄·층 격자를 보고, 줄을 확대해 박스 스택을 확인하고, 칸을 클릭해 상세 품목·수량까지 내려가는 단계가 모두 이 폴더의 부품으로 그려집니다.

박스 색은 그 박스에 든 품목의 "대표 부서색"이라서, 색만 봐도 어느 공정 물건인지 한눈에 구분됩니다.

## 언제 보면 좋나

- 창고 지도의 격자·박스 칸 모양이나 색을 바꾸고 싶을 때
- 박스 색이 이상하게 나올 때(부서색 계산을 `helpers.ts` 에서 확인)
- 정면도/줄 확대의 칸 크기·층 정렬이 깨질 때(`WarehouseStages.tsx` 의 fit 계산)

## 먼저 볼 파일

- [[ERP/frontend/app/legacy/_components/_warehouse_map_sections/WarehouseStages.tsx]] — 평면도·정면도·줄 확대 세 단계 화면을 그리는 핵심.
- [[ERP/frontend/app/legacy/_components/_warehouse_map_sections/JariColumn.tsx]] — 박스 한 칸(자리 스택)을 색·품목명·수량으로 그리는 가장 작은 부품.
- [[ERP/frontend/app/legacy/_components/_warehouse_map_sections/WarehouseJariPanel.tsx]] — 칸을 클릭하면 오른쪽에 슬라이드로 뜨는 상세 패널.
- [[ERP/frontend/app/legacy/_components/_warehouse_map_sections/helpers.ts]] — 박스 색인·부서색·자리 스택 계산 등 그림 없는 순수 계산.
- [[ERP/frontend/app/legacy/_components/_warehouse_map_sections/warehouseMap.module.css]] — hover·강조(펄스)·단계 전환 애니메이션 CSS.

## 조심할 점

- 색은 모두 `LEGACY_COLORS` 토큰과 globals.css 변수로 통일돼 있습니다. CSS 모듈에서도 색을 직접 적지 말고 변수를 쓰세요.
- 부서색은 `helpers.ts` 의 `dominantColor`(수량 가중 최빈 부서)가 정합니다. 색 규칙을 바꾸려면 여기 한 곳만 고치면 됩니다.
- 박스 크기(대/중/소)는 `SIZE_UNIT`(대3·중2·소1)으로 높이 비율과 자리 용량을 동시에 결정합니다. 한쪽만 바꾸면 칸이 어긋납니다.

## 다음에 볼 위치

- 상위 폴더: [[ERP/frontend/app/legacy/_components/📁__components]]
- 화면 본체: [[ERP/frontend/app/legacy/_components/DesktopWarehouseMapView.tsx]]
