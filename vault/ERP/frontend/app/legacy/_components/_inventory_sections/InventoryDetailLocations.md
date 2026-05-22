---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy\_components\_inventory_sections/InventoryDetailLocations.tsx
tags: [vault, code-note, frontend, b-tier]
---

# InventoryDetailLocations — 위치별 재고 섹션

> [!summary] 역할
> warehouse_qty + 부서별 locations. 위치별 수량 행 목록.

## 1. 이 파일의 역할

InventoryDetailPanel의 "위치별 재고" 서브섹션. 창고 수량 + 부서별 위치(locations 배열) 조건부 표시. getDeptColor로 부서 색상. 부모가 warehouse_qty > 0 조건 확인 후 렌더.

## 2. 실제 원본 위치

`erp/frontend/app/legacy\_components\_inventory_sections/InventoryDetailLocations.tsx` ([[erp/frontend/app/legacy\_components\_inventory_sections/InventoryDetailLocations.tsx|원본]])

## 3. 주요 import

- `Item` from `@/lib/api`
- `LEGACY_COLORS` from `@/lib/mes/color`
- `formatQty` from `@/lib/mes/format`

## 4. 어디서 쓰이는지

- InventoryDetailPanel의 자식 섹션
- 부모: 재고 상세 view

## 5. ⚠️ 위험 포인트

> [!warning] item.locations nullable — default [] 처리
> warehouse_qty > 0 조건은 부모 책임

## 6. 수정 전 체크

- [ ] Item.locations 구조 변경 시 반복 로직 갱신
- [ ] getDeptColor 콜백 undefined 방지
