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
      <ChevronDown
        className="h-3.5 w-3.5 transition-transform"
        style={{ transform: filtersOpen ? "rotate(180deg)" : undefined }}
      />
    </button>
  );
}
