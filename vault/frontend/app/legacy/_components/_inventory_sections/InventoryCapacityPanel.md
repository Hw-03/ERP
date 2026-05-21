---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy\_components\_inventory_sections/InventoryCapacityPanel.tsx
tags: [vault, code-note, frontend, b-tier]
---

# InventoryCapacityPanel — 생산 능력 패널

> [!summary] 역할
> 제품 생산 가능 여부. 상태(producible/not_producible/bom_not_registered) 표시. 병목 품목 표시.

## 1. 이 파일의 역할

ProductionCapacity 데이터 표시. resolveStatus로 상태 결정(백엔드 status 또는 fallback). 생산가능/불가 상태별 색상(cyan/yellow). 병목 품목(limiting_item) 표시. null 입력 시 조건부 null 반환. onClick 콜백 선택적.

## 2. 실제 원본 위치

`erp/frontend/app/legacy\_components\_inventory_sections/InventoryCapacityPanel.tsx` ([[erp/frontend/app/legacy\_components\_inventory_sections/InventoryCapacityPanel.tsx|원본]])

## 3. 주요 import

- `ProductionCapacity`, `ProductionCapacityStatus` from `@/lib/api`
- `LEGACY_COLORS` from `@/lib/mes/color`
- `formatQty` from `@/lib/mes/format`
- Icons: `AlertTriangle`, `Zap` from lucide-react

## 4. 어디서 쓰이는지

- DesktopInventoryRightPanel (재고 상세 우측)
- 부모: 생산 능력 state

## 5. ⚠️ 위험 포인트

> [!warning] resolveStatus fallback 로직 — 백엔드 response 변경 시 검증
> onClick 선택적 — undefined 체크 필수

## 6. 수정 전 체크

- [ ] ProductionCapacityStatus enum 변경 시 색상 매핑 갱신
- [ ] top_items 구조 변경 시 bottleneck 로직 재검토
