---
type: index
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_inventory_sections/
tags: [vault, index, folder-marker]
aliases:
  - "_inventory_sections"
  - "_inventory_sections.md"
---

# 📁 _inventory_sections

> [!summary] 역할
> 데스크톱 재고 화면(`DesktopInventoryView`)의 KPI·필터·목록·상세·생산가능 패널을 분리한 섹션 모음.

> [!info] 코드 미러 영역
> 이 폴더는 `erp/frontend/app/legacy/_components/_inventory_sections/` 의 vault 미러.

## 어떤 파일들이 있나

핵심 파일:
- `InventoryCapacityPanel.tsx` — 생산가능 수량 패널. `ProductionCapacity` 데이터를 받아 상태(`producible` / `not_producible` / `bom_not_registered`)별 accent 색으로 표시
- `InventoryItemRow.tsx` — 재고 목록 단일 행. 부서별 재고 게이지 세그먼트·임계 재고 경고 포함. `memo` 래핑
- `InventoryFilterToggleButton.tsx` — 필터 패널 토글 버튼. 활성 필터 수 뱃지 표시
- `InventoryDetailLocations.tsx` — 품목 상세의 "위치별 재고" 섹션. 창고 + 부서별 수량 목록
- `InventoryDetailLogList.tsx` — 품목 상세의 "최근 이력" 섹션. `TransactionLog` 목록 렌더
- `DesktopInventoryRightPanel.tsx` — 우측 슬라이딩 패널 컨테이너. `SlidePanel` + `DesktopRightPanel` 조합으로 `displayItem` 유지 패턴 사용
- `InventoryActionRequired.tsx` — 부족·품절 건수 배너. 0건이면 null 반환

부수 파일:
- `InventoryFilterBar.tsx` — 부서칩·공정단계칩·모델칩·검색어 필터 전체 패널 (DEPT_CHIPS: 튜브/고압/진공/튜닝/조립/출하)
- `InventoryDetailPanel.tsx` — 상세 패널 최상위 조합 (Locations + LogList + CapacityPanel)
- `InventoryItemsTable.tsx` — 아이템 목록 테이블/리스트 래퍼
- `InventoryKpiPanel.tsx` — 재고 KPI 수치 상단 패널

## 도메인 컨텍스트

재고 화면은 좌측 목록(`InventoryItemRow` 리스트) + 우측 슬라이딩 상세(`DesktopInventoryRightPanel`)
패턴이다. 품목 선택 → 오른쪽 패널에 `InventoryDetailPanel` 이 슬라이드인 된다.

`InventoryCapacityPanel` 은 `ProductionCapacity.status` 가 없는 구버전 응답에 대한 fallback 로직을 갖는다.
생산가능 수량은 `immediate` (즉시 생산) / `maximum` (최대 생산) 두 값으로 구분된다.

필터는 `InventoryFilterToggleButton` 토글로 `InventoryFilterBar` 패널을 열고 닫는다.
활성 필터 수는 버튼에 숫자 뱃지로 표시된다.

## ⚠️ 위험 포인트

- `DesktopInventoryRightPanel` 은 `selectedItem` 이 null 이어도 `displayItem` 으로 마지막 선택을 유지한다.
  두 prop 을 혼동하면 패널이 빈 상태로 열리거나 잘못된 품목을 표시할 수 있다.
- `InventoryItemRow` 는 재고 게이지 계산에서 `item.locations` 배열을 직접 사용한다.
  백엔드가 `locations` 를 빈 배열 대신 null 로 반환하면 런타임 에러 발생 가능.

## 관련 가이드

- [[erp/_vault/guides/inventory-flow]]

## 자식 폴더

없음 (플랫 구조)
