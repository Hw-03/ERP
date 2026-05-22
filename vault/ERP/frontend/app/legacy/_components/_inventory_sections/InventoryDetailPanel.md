---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy\_components\_inventory_sections/InventoryDetailPanel.tsx
tags: [vault, code-note, frontend, b-tier]
---

# InventoryDetailPanel — 재고 품목 상세 패널

> [!summary] 역할
> 선택 Item 상세 보기. 예약(reservation), 위치, 거래 로그.

## 1. 이 파일의 역할

재고 목록에서 선택한 Item의 상세 패널. pending_qty > 0 시 api.getItemReservations() 로드. InventoryDetailLocations(위치별 수량), InventoryDetailLogList(거래 로그), 예약 목록 표시. onGoToWarehouse 콜백으로 입출고 탭 전환.

## 2. 실제 원본 위치

`erp/frontend/app/legacy\_components\_inventory_sections/InventoryDetailPanel.tsx` ([[erp/frontend/app/legacy\_components\_inventory_sections/InventoryDetailPanel.tsx|원본]])

## 3. 주요 import

- React: `useEffect`, `useState`
- `api`, `Item`, `StockRequestReservationLine`, `TransactionLog` from `@/lib/api`
- `LEGACY_COLORS` from `@/lib/mes/color`
- `normalizeDepartment` from `@/lib/mes/department`
- `formatQty` from `@/lib/mes/format`
- `useDeptColorLookup` from `../DepartmentsContext`
- `InventoryDetailLogList`, `InventoryDetailLocations` (자식)

## 4. 어디서 쓰이는지

- DesktopInventoryRightPanel
- 부모: 재고 상세 view

## 5. ⚠️ 위험 포인트

> [!warning] API 요청 취소 처리(cancelled) 필수 — cleanup function
> pending_qty 변경 감지 시 예약 재로드

## 6. 수정 전 체크

- [ ] api.getItemReservations 응답 포맷 변경 시 state 동기화
- [ ] pendingQty/availableQty 계산 로직 정합성
