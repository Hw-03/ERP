import type { ReactNode, Ref } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { InventoryTableStickyHeader } from "../_inventory_sections/InventoryFilterBar";
import { InlineSearch } from "../mobile/primitives/InlineSearch";
import type { StocktakeVariant } from "./StocktakeLayout";

type Props = {
  variant: StocktakeVariant; value: string; onChange: (value: string) => void;
  count: number; filtered: boolean; onReset: () => void;
  headerRef?: Ref<HTMLDivElement>; disabled?: boolean;
  mobileToolbar?: ReactNode;
};

/** Loading and live searches share the sticky surface and its corner backdrop. */
export function StocktakeSearchHeader({ variant, value, onChange, count, filtered, onReset, headerRef, disabled = false, mobileToolbar }: Props): ReactNode {
  return variant === "mobile" ? <div ref={headerRef} className={`sticky top-0 z-20 ${mobileToolbar ? "" : "mb-2"}`} style={{ background: LEGACY_COLORS.bg }}>
    {mobileToolbar ?? <InlineSearch value={value} onChange={onChange} placeholder="품명 · 품목 코드 검색" ariaLabel="품목 검색" disabled={disabled} />}
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-full h-2" style={{ background: LEGACY_COLORS.bg }} />
  </div> : <InventoryTableStickyHeader headerRef={headerRef} searchValue={value} onSearchChange={onChange}
    searchLabel="품목 검색" searchPlaceholder="품명 · 품목 코드 검색" count={count} isFiltered={filtered} onResetAllFilters={onReset} disabled={disabled} />;
}
