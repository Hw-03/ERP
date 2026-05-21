---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_inventory_sections/InventoryFilterToggleButton.tsx
tags: [vault, code-note, auto-generated, stub]
---

# InventoryFilterToggleButton.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_inventory_sections/InventoryFilterToggleButton.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { ChevronDown, Filter } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";

type Props = {
  filtersOpen: boolean;
  activeFilterCount: number;
  onToggle: () => void;
};

export function InventoryFilterToggleButton({ filtersOpen, activeFilterCount, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      className="flex shrink-0 items-center gap-1.5 rounded-[14px] border px-3 py-2 text-sm font-semibold transition-colors hover:brightness-110"
      style={{
        background: filtersOpen
          ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
          : LEGACY_COLORS.s2,
        borderColor: filtersOpen ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
        color: filtersOpen ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
      }}
      aria-expanded={filtersOpen}
      aria-controls="inventory-filter-panel"
    >
      <Filter className="h-3.5 w-3.5" />
      필터
      {activeFilterCount > 0 && (
        <span
```
