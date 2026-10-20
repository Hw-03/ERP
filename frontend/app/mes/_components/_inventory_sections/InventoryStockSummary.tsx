"use client";

import type { StocktakeInventorySummary } from "@/lib/api/types/stocktake";
import type { DefectManagementCategory } from "@/lib/api/types/defects";
import type { InventoryReservationSummary } from "@/lib/api/types/inventory";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { totalApprovalPending } from "@/lib/mes/inventory";
import { useDeptColorLookup } from "../DepartmentsContext";
import { getManagedStockBreakdown, STOCK_CATEGORY_ORDER, STOCK_CATEGORY_STYLES } from "./inventoryManagedStock";

/** Dashboard and census display the same live buckets; none are count draft values. */
export function InventoryStockSummary({ item, compact = false, mode = "chips", showWorkReservations = false }: {
  item: StocktakeInventorySummary & { work_reservations?: InventoryReservationSummary }; compact?: boolean; mode?: "bar" | "chips";
  /** 실사 소비자는 물리 재고 표시를 유지한다. */
  showWorkReservations?: boolean;
}) {
  const getDeptColor = useDeptColorLookup();
  const summary = showWorkReservations ? item.work_reservations : undefined;
  const pendingQty = totalApprovalPending(item);
  const reservedAt = (department: string | null): number => summary?.reservation_by_location
    .filter((row) => row.location.bucket === (department == null ? "warehouse" : "production") && row.location.department === department)
    .reduce((sum, row) => sum + row.work_reserved_quantity + row.approval_reserved_quantity + row.shipping_reserved_quantity, 0) ?? 0;
  const DEFECT_RED = compact ? LEGACY_COLORS.red : STOCK_CATEGORY_STYLES.DEFECT.color;
  const total = Math.max(Number(item.quantity), 1);
  const wh = Number(item.warehouse_qty);
  const allLocs = (item.locations ?? []).filter((l) => Number(l.quantity) > 0);
  const prodLocs = allLocs.filter((l) => l.status !== "DEFECTIVE");
  const managedStock = getManagedStockBreakdown(item);
  const segments: { pct: number; color: string; label: string; reservedPct?: number; category?: DefectManagementCategory }[] = [];
  let used = 0;
  if (wh > 0) {
    const pct = Math.min(100, (wh / total) * 100);
    const reserved = reservedAt(null);
    segments.push({ pct, color: compact ? LEGACY_COLORS.cyan : LEGACY_COLORS.green,
      label: `창고 ${formatQty(wh)}${reserved > 0 ? ` · 예약 ${formatQty(reserved)}` : ""}`, reservedPct: Math.min(100, reserved / wh * 100) });
    used += pct;
  }
  for (const loc of prodLocs) {
    const pct = Math.min(100 - used, (Number(loc.quantity) / total) * 100);
    if (pct <= 0) break;
    segments.push({
      pct,
      color: getDeptColor(loc.department),
      label: `${loc.department} ${formatQty(loc.quantity)}${reservedAt(loc.department) > 0 ? ` · 예약 ${formatQty(reservedAt(loc.department))}` : ""}`,
      reservedPct: Math.min(100, reservedAt(loc.department) / Number(loc.quantity) * 100),
    });
    used += pct;
  }
  for (const category of STOCK_CATEGORY_ORDER) {
    for (const entry of managedStock.filter((row) => row.management_category === category)) {
      const pct = Math.min(100 - used, (Number(entry.quantity) / total) * 100);
      if (pct <= 0) break;
      const { label, color } = STOCK_CATEGORY_STYLES[category];
      segments.push({
        pct,
        color: category === "DEFECT" ? DEFECT_RED : color,
        label: `${entry.department} [${label}] ${formatQty(entry.quantity)}`,
        category,
      });
      used += pct;
    }
  }

  const prodQtyByDept = new Map<string, number>();
  for (const loc of prodLocs) {
    prodQtyByDept.set(loc.department, (prodQtyByDept.get(loc.department) ?? 0) + Number(loc.quantity));
  }
  const stockChips: { key: string; label: string; quantity: number; color: string; reserved?: number }[] = [];
  if (wh > 0) {
    stockChips.push({ key: "warehouse", label: "창고", quantity: wh, color: LEGACY_COLORS.green, reserved: reservedAt(null) });
  }
  if (!summary && pendingQty > 0) {
    stockChips.push({ key: "pending", label: "예약", quantity: pendingQty, color: LEGACY_COLORS.yellow });
  }
  for (const [dept, quantity] of Array.from(prodQtyByDept)) {
    stockChips.push({ key: `dept-${dept}`, label: dept, quantity, color: getDeptColor(dept), reserved: reservedAt(dept) });
  }
  for (const category of STOCK_CATEGORY_ORDER) {
    const quantity = managedStock.filter((entry) => entry.management_category === category)
      .reduce((sum, entry) => sum + Number(entry.quantity), 0);
    if (quantity > 0) {
      const { label, color } = STOCK_CATEGORY_STYLES[category];
      stockChips.push({ key: category, label, quantity, color: category === "DEFECT" ? DEFECT_RED : color });
    }
  }


  const stockBar = Number(item.quantity) === 0 ? (
    <div className={compact ? "mt-2 h-1 overflow-hidden rounded-full" : "mt-[20px] h-[6px] overflow-hidden rounded-full"} style={{ background: DEFECT_RED }} title="품절" />
  ) : (
    <div
      className={compact ? "mt-2 flex h-1 overflow-hidden rounded-full" : "mt-[20px] flex h-[6px] overflow-hidden rounded-full"}
      style={{ background: LEGACY_COLORS.s3 }}
      title={segments.map((s) => s.label).join(" / ")}
      role="img"
      aria-label={`재고 분포: ${segments.map((s) => `${s.label} ${s.pct.toFixed(0)}%`).join(", ")}`}
    >
      {segments.map((s, i) => (
        <div key={i} data-stock-category={s.category} className="relative h-full shrink-0" style={{
          width: `${s.pct}%`,
          backgroundColor: s.color,
          ...(s.category ? { color: s.color, ...STOCK_CATEGORY_STYLES[s.category].pattern } : {}),
        }}>
          {!!s.reservedPct && <span data-reservation-overlay aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 z-[1]"
            style={{ width: `${s.reservedPct}%`, backgroundImage: `repeating-linear-gradient(135deg, transparent 0 3px, ${LEGACY_COLORS.s1} 3px 5px)` }} />}
          {segments[i + 1] && segments[i + 1].color !== s.color && (
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0"
              style={{ width: "min(24px, 50%)", background: `linear-gradient(to right, transparent, ${segments[i + 1].color})` }} />
          )}
        </div>
      ))}
    </div>
  );

  if (mode === "bar") return stockBar;
  return (
        <div data-testid="inventory-dept-stock-summary" className="flex min-w-0 flex-wrap items-center justify-center gap-1.5">
          {stockChips.length === 0
            ? "-"
            : stockChips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex flex-wrap items-center justify-center gap-x-1 rounded-full border px-2 py-0.5 text-xs font-bold"
                style={{
                  color: chip.color,
                  background: `color-mix(in srgb, ${chip.color} 14%, transparent)`,
                  borderColor: `color-mix(in srgb, ${chip.color} 35%, transparent)`,
                }}
              >
                <span className="whitespace-nowrap">{chip.label} {formatQty(chip.quantity)}</span>
                {!!chip.reserved && <span className="whitespace-nowrap">· 예약 {formatQty(chip.reserved)}</span>}
              </span>
            ))}
        </div>
  );
}
