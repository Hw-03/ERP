---
type: file-explanation
source_path: "frontend/app/mes/_components/DesktopWarehouseMapView.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-06-24
project: DEXCOWIN MES
---

# DesktopWarehouseMapView.tsx — 창고 지도 데스크톱 뷰

## 이 파일은 뭐예요?

창고 지도 화면의 데스크톱 구현입니다. 2026-06-23 편집탭 통합으로 3탭에서 2탭으로 변경됐습니다.

## 언제 보나요?

- 창고 지도 화면 버그나 UI 이상이 발생할 때
- 박스 이동·넣기·빼기 흐름을 따라갈 때
- 앵글 편집(구조 변경) 흐름을 확인할 때

## 중요한 내용

**현재 2탭 구조 (2026-06-23 통합)**

| 탭 | 역할 |
|---|---|
| 박스 관리 | 박스 이동(드래그) + 박스 넣기/빼기/편집 통합 |
| 앵글 편집 | 앵글 구조 추가·수정·삭제 |

이전에는 3탭(박스 배치 / 재고 관리 / 앵글 편집)이었으나 통합됨. `placement` 탭은 제거됐음.

**편집 모드**

`editable` prop이 `true`일 때만 박스 이동·넣기 기능이 활성화됩니다. 창고 관리자(`warehouse_role`)만 편집 모드 진입 가능.

**품목 검색**

`ItemMatch` 타입으로 품목 단위 검색 결과를 묶습니다 — 칸 단위가 아니라 품목 단위로 히트를 그룹핑.

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_map_sections/WarehouseStages.tsx]] — 층/줄/앵글 단계 컴포넌트
- [[ERP/frontend/lib/api/warehouse-map.ts]] — 창고 지도 API 클라이언트
- [[ERP/backend/app/routers/warehouse_map/📁_warehouse_map]] — 창고 지도 백엔드 API

> [!info]- 더 연결된 파일
> - `_attic/docs/warehouse-box-depletion-design.md` — 박스 차감 설계 문서
