---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_inventory_sections/inventoryFilter.ts
tags: [vault, code-note, auto-generated, stub]
---

# inventoryFilter.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_inventory_sections/inventoryFilter.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
import type { Item } from "@/lib/api";
import type { KpiFilter } from "./InventoryKpiPanel";

/**
 * Inventory 필터/계산 helper.
 * Round-9 (R9-2) 분리. DesktopInventoryView 의 4개 helper 함수를 모음.
 */

export function getMinStock(item: Item): number {
  return item.min_stock == null ? 0 : Number(item.min_stock);
}

export function safeQty(item: Item): number {
  const n = Number(item.quantity);
  return isNaN(n) ? 0 : n;
}

export function matchesSearch(item: Item, keyword: string): boolean {
  if (!keyword) return true;
  const haystack = [
    item.item_code,
    item.item_name,
    item.spec ?? "",
    item.location ?? "",
    item.supplier ?? "",
    item.barcode ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(keyword);
```
