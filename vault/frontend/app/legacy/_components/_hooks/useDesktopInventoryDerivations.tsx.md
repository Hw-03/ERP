---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_hooks/useDesktopInventoryDerivations.tsx
tags: [vault, code-note, auto-generated, stub]
---

# useDesktopInventoryDerivations.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_hooks/useDesktopInventoryDerivations.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { getStockState } from "@/lib/mes/inventory";
import type { KpiCardData as KpiCard } from "../_inventory_sections/InventoryKpiPanel";
import { getMinStock, safeQty } from "../_inventory_sections/inventoryFilter";

/**
 * Round-13 (#20) 추출 — DesktopInventoryView 의 summary/kpiCards/badge derivation hook.
 */
export interface UseDesktopInventoryDerivationsResult {
  isFiltered: boolean;
  activeFilterCount: number;
  kpiCards: KpiCard[];
  headerBadge: ReactNode;
}

export function useDesktopInventoryDerivations({
  items,
  scopedItems,
  filteredItems,
  selectedDepts,
  selectedModels,
  selectedProcessSteps,
  deferredLocalSearch,
  displayItem,
  onSummaryChange,
```
