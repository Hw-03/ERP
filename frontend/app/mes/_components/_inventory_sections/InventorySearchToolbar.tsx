"use client";

import { SlidersHorizontal } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { InlineSearch } from "../mobile/primitives/InlineSearch";
import { InventoryFilterLogicToggle } from "./InventoryFilterToggleButton";
import type { InventoryFilterLogic } from "./inventoryFilter";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchLabel?: string;
  filtersOpen: boolean;
  filterLogic: InventoryFilterLogic;
  onFilterLogicChange: (logic: InventoryFilterLogic) => void;
  onToggleFilters: () => void;
  isFiltered: boolean;
  activeFilterCount?: number;
  controlsId?: string;
  disabled?: boolean;
  onManageSearch?: () => void;
};

/** Share the dashboard's search row while each screen owns its filter semantics. */
export function InventorySearchToolbar({ value, onChange, placeholder = "품명 · 코드 · 위치 · 공급처", searchLabel,
  filtersOpen, filterLogic, onFilterLogicChange, onToggleFilters, isFiltered, activeFilterCount = 0,
  controlsId = "inventory-filter-panel", disabled = false, onManageSearch }: Props) {
  return <div role="search" aria-label={searchLabel ? `${searchLabel} 및 필터` : "재고 검색 및 필터"} className="flex min-w-0 items-center gap-2">
    <InlineSearch value={value} onChange={onChange} placeholder={placeholder} ariaLabel={searchLabel} disabled={disabled} className="min-w-0 flex-1" />
    {onManageSearch && <button type="button" onClick={onManageSearch} aria-label="검색어 연결" disabled={disabled}
      className="inline-flex h-11 shrink-0 items-center justify-center rounded-[14px] border px-3 text-sm font-semibold active:scale-95 disabled:opacity-50"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.blue }}>검색어 연결</button>}
    <div className={`flex shrink-0 self-stretch items-center${filtersOpen ? " gap-2" : ""}`}>
      <InventoryFilterLogicToggle open={filtersOpen} logic={filterLogic} onLogicChange={onFilterLogicChange} disabled={disabled} />
      <button type="button" onClick={onToggleFilters} disabled={disabled}
        aria-label={filtersOpen ? "필터 닫기" : "필터 열기"} aria-expanded={filtersOpen} aria-controls={controlsId}
        className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border transition-[transform] active:scale-95 disabled:opacity-50"
        style={{ background: filtersOpen || isFiltered ? LEGACY_COLORS.blue : LEGACY_COLORS.s2,
          borderColor: LEGACY_COLORS.border, color: filtersOpen || isFiltered ? LEGACY_COLORS.white : LEGACY_COLORS.muted }}>
        <SlidersHorizontal size={18} strokeWidth={2} />
        {activeFilterCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold"
          style={{ background: LEGACY_COLORS.redSolid, color: LEGACY_COLORS.white }}>{activeFilterCount}</span>}
      </button>
    </div>
  </div>;
}
