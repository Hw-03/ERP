---
type: folder-note
source_path: "frontend/app/legacy/_components/_warehouse_sections"
importance: normal
layer: frontend
graph: hub
updated: 2026-06-05
project: DEXCOWIN MES
---

# 📁 _warehouse_sections

## 이 폴더는 무엇을 위한 곳인가

`frontend/app/legacy/_components/_warehouse_sections`는 프론트엔드 화면이나 공용 로직의 세부 폴더입니다.

## 현장 업무와의 관계

사용자가 보는 화면이나 화면이 서버와 통신하는 방식에 연결됩니다. 입출고 요청 화면 외에, 튜브→고압/진공으로 물건을 넘기는 **인수인계** 기능도 이 폴더에 있습니다(작성 폼·탭 패널·인쇄). 인수인계는 받는 부서가 "인수 확인"을 누르면 품목 수량만큼 실제 재고가 이동하는 점이 핵심입니다.

## 언제 보면 좋나

- 이 폴더 안의 파일이 어떤 역할인지 빠르게 파악할 때
- 수정 전에 먼저 읽을 파일을 고를 때

## 먼저 볼 파일 5개

- [[ERP/frontend/app/legacy/_components/_warehouse_sections/DepartmentQueuePanel.tsx]] — `DepartmentQueuePanel.tsx`는 입출고 요청 작성, 작업중 목록, 내 요청, 창고 승인함 같은 창고 업무 화면의 일부입니다.
- [[ERP/frontend/app/legacy/_components/_warehouse_sections/DraftCartItemRow.tsx]] — `DraftCartItemRow.tsx`는 입출고 요청 작성, 작업중 목록, 내 요청, 창고 승인함 같은 창고 업무 화면의 일부입니다.
- [[ERP/frontend/app/legacy/_components/_warehouse_sections/DraftCartPanel.tsx]] — `DraftCartPanel.tsx`는 입출고 요청 작성, 작업중 목록, 내 요청, 창고 승인함 같은 창고 업무 화면의 일부입니다.
- [[ERP/frontend/app/legacy/_components/_warehouse_sections/IoDraftWorkCard.tsx]] — `IoDraftWorkCard.tsx`는 입출고 요청 작성, 작업중 목록, 내 요청, 창고 승인함 같은 창고 업무 화면의 일부입니다.
- [[ERP/frontend/app/legacy/_components/_warehouse_sections/MyRequestRow.tsx]] — `MyRequestRow.tsx`는 입출고 요청 작성, 작업중 목록, 내 요청, 창고 승인함 같은 창고 업무 화면의 일부입니다.

> [!info]- 추가 파일
> - [[ERP/frontend/app/legacy/_components/_warehouse_sections/MyRequestsPanel.tsx]] — MyRequestsPanel.tsx
> - [[ERP/frontend/app/legacy/_components/_warehouse_sections/WarehouseAccessDenied.tsx]] — WarehouseAccessDenied.tsx
> - [[ERP/frontend/app/legacy/_components/_warehouse_sections/WarehouseDraftPanelTabs.tsx]] — WarehouseDraftPanelTabs.tsx
> - [[ERP/frontend/app/legacy/_components/_warehouse_sections/WarehouseHeader.tsx]] — WarehouseHeader.tsx
> - [[ERP/frontend/app/legacy/_components/_warehouse_sections/WarehouseQueuePanel.tsx]] — WarehouseQueuePanel.tsx
> - [[ERP/frontend/app/legacy/_components/_warehouse_sections/WarehouseQueueRow.tsx]] — WarehouseQueueRow.tsx
> - [[ERP/frontend/app/legacy/_components/_warehouse_sections/WarehouseSectionTabs.tsx]] — WarehouseSectionTabs.tsx
> - [[ERP/frontend/app/legacy/_components/_warehouse_sections/ioRequestLabels.ts]] — ioRequestLabels.ts

## 인수인계 (2026-06 신규)

튜브 → 고압/진공으로 물건을 넘기는 인수인계 기능 3종입니다.

- [[ERP/frontend/app/legacy/_components/_warehouse_sections/HandoverSectionPanel.tsx]] — 인수인계 탭 전체(작성·내 인수인계·인수 대기함) + 인수 확인(PIN→재고 이동).
- [[ERP/frontend/app/legacy/_components/_warehouse_sections/HandoverComposeForm.tsx]] — 튜브 인수인계서 작성 폼(품목·수량 = 실제 재고 이동 대상).
- [[ERP/frontend/app/legacy/_components/_warehouse_sections/handoverPrint.ts]] — 인수인계서를 양식대로 새 창에 띄워 인쇄.

## 조심할 점

폴더 성격을 먼저 확인하고 현재 운영 코드인지, 보관 자료인지, 자동 생성물인지 구분해야 합니다.

## 다음에 볼 위치

- 상위 폴더: [[ERP/frontend/app/legacy/_components/📁__components]]
