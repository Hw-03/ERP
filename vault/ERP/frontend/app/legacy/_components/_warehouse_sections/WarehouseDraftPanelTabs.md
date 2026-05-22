---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_sections/WarehouseDraftPanelTabs.tsx
tags: [vault, code-note, frontend, b-tier]
---

# WarehouseDraftPanelTabs — 입출고 탭별 패널 분기

> [!summary] 역할
> sectionTab에 따라 cart/mine/queue 중 하나의 패널만 조건부 렌더.

## 1. 이 파일의 역할

DesktopWarehouseView의 draft 및 작업 큐 탭 분기. cart(장바구니) → DraftCartPanel, mine(내 요청) → MyRequestsPanel, queue(전체 큐) → WarehouseQueuePanel, dept_queue(부서 큐) → DepartmentQueuePanel으로 분기. 조건부 권한 확인(canSeeQueue, canSeeDeptQueue).

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/_warehouse_sections/WarehouseDraftPanelTabs.tsx` ([[erp/frontend/app/legacy/_components/_warehouse_sections/WarehouseDraftPanelTabs.tsx|원본]])

## 3. 주요 import

- `api` from `@/lib/api`
- `MyRequestsPanel`, `WarehouseQueuePanel`, `DepartmentQueuePanel`, `DraftCartPanel`
- `WarehouseSectionTab` from `./WarehouseSectionTabs`

## 4. 어디서 쓰이는지

- DesktopWarehouseView에서 tab 전환
- 각 패널(MyRequestsPanel, WarehouseQueuePanel 등)로 props 전달
- [[WarehouseSectionTabs 탭 선택 연동]]

## 5. ⚠️ 위험 포인트

> [!warning] 권한별 패널 조건 누락 시 unauthorized 접근 가능
> compose 탭은 본 컴포넌트 외부에 위치 — 탭 전환 로직 일관성 점검

## 6. 수정 전 체크

- [ ] canSeeQueue/canSeeDeptQueue 권한 로직 재확인
- [ ] 새 탭 추가 시 분기 누락 방지
- [ ] props 인터페이스 확장 후 모든 호출처 동기화
