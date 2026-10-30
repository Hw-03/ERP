"use client";

import { useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";

export type InventoryTableColumn = {
  label: string;
  header?: ReactNode;
  width?: string;
  minWidth?: string;
  nowrap?: boolean;
  center?: boolean;
  hidden?: boolean;
  className?: string;
  ariaHidden?: boolean;
};

/** Share the dashboard's sticky header, corner masks and table surface. */
export function InventoryTable({ columns, compact, loading, stickyTop, fillAvailableSpace = false, tableRef, tableClassName = "", ariaLabel, showHeader = true, children }: {
  columns: InventoryTableColumn[]; compact?: boolean; loading?: boolean;
  stickyTop?: string; fillAvailableSpace?: boolean; children: ReactNode;
  tableRef?: Ref<HTMLTableElement>; tableClassName?: string; ariaLabel?: string; showHeader?: boolean;
}) {
  const top = stickyTop ?? (compact ? "var(--mobile-inventory-header-top,54px)" : "var(--desktop-inventory-header-top,75px)");
  const topClass = compact ? "top-[var(--mobile-inventory-header-top,54px)]" : "top-[var(--desktop-inventory-header-top,75px)]";
  const firstVisibleColumn = columns.findIndex(column => !column.ariaHidden);
  return <>
    {showHeader && compact && <div aria-hidden="true" data-testid="inventory-mobile-header-corners" className={`pointer-events-none sticky ${topClass} z-20 -mb-5 flex h-5 justify-between`} style={{ top }}>
      <span className="absolute inset-x-5 top-0 h-px" style={{ background: LEGACY_COLORS.border }} />
      <span className="h-5 w-5" style={{ background: "radial-gradient(circle at 100% 100%, transparent 0 19px, var(--c-border) 19px 20px, var(--c-bg) 20px)" }} />
      <span className="h-5 w-5" style={{ background: "radial-gradient(circle at 0 100%, transparent 0 19px, var(--c-border) 19px 20px, var(--c-bg) 20px)" }} />
    </div>}
    <div className={`${showHeader ? compact ? "overflow-clip rounded-[20px] border" : "overflow-clip rounded-[24px]" : ""}${fillAvailableSpace ? " flex-1" : ""}`} style={compact && showHeader ? { borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 } : undefined}>
      {showHeader && !compact && <div aria-hidden="true" data-testid="inventory-table-corner-mask" className={`pointer-events-none sticky ${topClass} z-20 -mb-6 flex h-6 justify-between`} style={{ top }}>
        <span className="h-6 w-6" style={{ background: "radial-gradient(circle at 100% 100%, transparent 0 23px, color-mix(in srgb, var(--c-border) 50%, transparent) 23px 24px, var(--c-inventory-table-corner-backdrop) 24px)" }} />
        <span className="h-6 w-6" style={{ background: "radial-gradient(circle at 0 100%, transparent 0 23px, color-mix(in srgb, var(--c-border) 50%, transparent) 23px 24px, var(--c-inventory-table-corner-backdrop) 24px)" }} />
      </div>}
      <table ref={tableRef} aria-label={ariaLabel} aria-busy={loading || undefined} className={`${compact ? "w-full table-fixed" : "min-w-full"} border-separate border-spacing-0 text-sm ${tableClassName}`}>
        {showHeader && <thead className={`sticky ${topClass} z-10`} style={{ top }}><tr>{columns.map(({ label, header, width, minWidth, nowrap, center, hidden, ariaHidden, className = "" }, index) => <th key={label} scope="col" aria-hidden={ariaHidden || undefined}
          className={`${compact ? "border-b px-2 py-2.5 text-xs font-medium" : "border-y px-4 py-2.5 text-sm font-bold"}${index === firstVisibleColumn && !compact ? " rounded-tl-[24px] border-l" : ""}${index === columns.length - 1 && !compact ? " rounded-tr-[24px] border-r" : ""}${nowrap ? " whitespace-nowrap" : ""}${center ? " text-center" : " text-left"}${hidden ? " hidden sm:table-cell" : ""} ${className}`}
          style={{ background: "var(--c-inventory-table-header)", borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, width, minWidth }}>{header ?? label}</th>)}</tr></thead>}
        <tbody className={!loading && !compact ? "mes-data-reveal" : undefined}>{children}</tbody>
      </table>
    </div>
  </>;
}

/** Preserve an optional status tone through hover and selection, with the shared selection marker. */
export function InventoryTableRow({ selected, onSelect, compact, targetId, tone, children }: {
  selected: boolean; onSelect: () => void; compact?: boolean; targetId?: string; tone?: string; children: ReactNode;
}): ReactNode {
  const [hovered, setHovered] = useState(false);
  const style: CSSProperties = {
    background: tone ? `color-mix(in srgb, ${tone} ${selected ? hovered ? 15 : 12 : hovered ? 10 : 7}%, ${LEGACY_COLORS.s1})`
      : selected ? compact ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 9%, ${LEGACY_COLORS.s1})` : tint(LEGACY_COLORS.blue, hovered ? 18 : 10) : hovered ? compact ? LEGACY_COLORS.s2 : LEGACY_COLORS.s4 : undefined,
    boxShadow: selected ? `inset 3px 0 0 ${LEGACY_COLORS.blue}` : hovered ? `inset 3px 0 0 ${tint(LEGACY_COLORS.blue, 45)}` : undefined,
  };
  return <tr role="button" tabIndex={0} aria-pressed={selected} data-stocktake-target={targetId}
    onClick={onSelect} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelect(); } }}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} style={style}
    className={`group cursor-pointer transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]${compact ? " h-[98px]" : ""}`}>
    {children}
  </tr>;
}
