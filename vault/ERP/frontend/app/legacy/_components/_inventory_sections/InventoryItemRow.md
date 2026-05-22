---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy\_components\_inventory_sections/InventoryItemRow.tsx
tags: [vault, code-note, frontend, b-tier]
---

# InventoryItemRow — 재고 품목 행 (memo 최적화)

> [!summary] 역할
> Item 하나를 행으로 표시. 상태(정상/부족/0), 이미지, 부서별 분포 게이지.

## 1. 이 파일의 역할

InventoryItemsTable 행. Item 상태(getStockState) 계산, 재고 부족 여부(isCritical), 부서별 위치 분포 게이지 segments 생성. memo로 감싸서 props 변경 시만 리렌더. onSelect 콜백으로 행 클릭.

## 2. 실제 원본 위치

`erp/frontend/app/legacy\_components\_inventory_sections/InventoryItemRow.tsx` ([[erp/frontend/app/legacy\_components\_inventory_sections/InventoryItemRow.tsx|원본]])

## 3. 주요 import

- React: `memo`
- `Image` from `next/image`
- `Item` from `@/lib/api`
- `LEGACY_COLORS` from `@/lib/mes/color`
- `itemCodeDept` from `@/lib/mes/process`
- `getStockState` from `@/lib/mes/inventory`
- `formatQty` from `@/lib/mes/format`
- `useDeptColorLookup` from `../DepartmentsContext`
- Icons: `AlertTriangle`, `CheckCircle2`, `XCircle`

## 4. 어디서 쓰이는지

- InventoryItemsTable 반복 렌더 (memo)
- 부모: 재고 목록

## 5. ⚠️ 위험 포인트

> [!warning] memo 최적화 — props 얕은 비교 주의
> getStockState 로직 — min_stock null 대응 필수

## 6. 수정 전 체크

- [ ] Item 구조 변경(quantity, warehouse_qty, locations) 시 계산 로직 갱신
- [ ] useDeptColorLookup 의존성 확인
