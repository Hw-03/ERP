"use client";

import { ChevronDown, Filter } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { InventoryFilterLogic } from "./inventoryFilter";

type Props = {
  filtersOpen: boolean;
  logic: InventoryFilterLogic;
  onLogicChange: (logic: InventoryFilterLogic) => void;
  onToggle: () => void;
};

export function InventoryFilterLogicToggle({
  open,
  logic,
  onLogicChange,
}: Pick<Props, "logic" | "onLogicChange"> & { open: boolean }) {
  return (
    <div
      aria-hidden={!open}
      className={`ift${open ? " is-open" : ""}`}
    >
      <div className="h-full min-w-0 overflow-hidden">
        <div
          className="inline-flex h-full shrink-0 items-stretch rounded-[14px] border p-1"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          {(["AND", "OR"] as const).map((value) => {
            const active = logic === value;
            return (
              <button
                key={value}
                type="button"
                aria-label={value}
                aria-pressed={active}
                disabled={!open}
                onClick={() => onLogicChange(value)}
                className="h-full rounded-[10px] px-2.5 py-1.5 text-xs font-bold transition-colors"
                style={{
                  background: active ? LEGACY_COLORS.blue : "transparent",
                  color: active ? LEGACY_COLORS.white : LEGACY_COLORS.muted2,
                }}
              >
                {value}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function InventoryFilterToggleButton({
  filtersOpen,
  logic,
  onLogicChange,
  onToggle,
}: Props) {
  return (
    <div className="flex shrink-0 self-stretch items-stretch gap-1.5">
      <button
        onClick={onToggle}
        className="flex h-full shrink-0 items-center gap-1.5 rounded-[14px] border px-3 py-2 text-sm font-semibold transition-colors hover:brightness-110"
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
      <InventoryFilterLogicToggle open={filtersOpen} logic={logic} onLogicChange={onLogicChange} />
    </div>
  );
}
