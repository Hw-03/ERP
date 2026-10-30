"use client";

import type { StocktakeInventorySummary } from "@/lib/api/types/stocktake";
import type { DefectManagementCategory } from "@/lib/api/types/defects";
import type { InventoryReservationSummary } from "@/lib/api/types/inventory";
import { AlertTriangle, ArrowDownToLine } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { totalApprovalPending } from "@/lib/mes/inventory";
import { useDeptColorLookup } from "../DepartmentsContext";
import { getManagedStockBreakdown, STOCK_CATEGORY_ORDER, STOCK_CATEGORY_STYLES } from "./inventoryManagedStock";

/** Dashboard and census display the same live buckets; none are count draft values. */
export function InventoryStockSummary({ item, compact = false, mode = "chips", showWorkReservations = false }: {
  item: StocktakeInventorySummary & { work_reservations?: InventoryReservationSummary; unit?: string }; compact?: boolean; mode?: "bar" | "chips";
  /** 실사 소비자는 물리 재고 표시를 유지한다. */
  showWorkReservations?: boolean;
}) {
  const getDeptColor = useDeptColorLookup();
  const summary = showWorkReservations ? item.work_reservations : undefined;
  const pendingQty = totalApprovalPending(item);
  const reservations = new Map<string | null, number>();
  for (const row of summary?.reservation_by_location ?? []) {
    if (row.location.bucket !== "warehouse" && row.location.bucket !== "production") continue;
    const department = row.location.bucket === "warehouse" ? null : row.location.department;
    const quantity = row.work_reserved_quantity + row.approval_reserved_quantity + row.shipping_reserved_quantity;
    reservations.set(department, (reservations.get(department) ?? 0) + quantity);
  }
  const reservedAt = (department: string | null): number => reservations.get(department) ?? 0;
  const reservedQuantity = summary
    ? summary.work_reserved_quantity + summary.approval_reserved_quantity + summary.shipping_reserved_quantity : pendingQty;
  const locatedReserved = Array.from(reservations.values()).reduce((sum, quantity) => sum + quantity, 0);
  const reservationRemainder = reservedQuantity - locatedReserved;
  const unlocatedReserved = reservationRemainder > 0.000001 ? reservationRemainder : 0;
  // 위치별 집계가 불완전하면 남은 예약 위치를 추측하지 않는다.
  const availabilityKnown = !!summary && unlocatedReserved === 0;
  const DEFECT_RED = compact ? LEGACY_COLORS.red : STOCK_CATEGORY_STYLES.DEFECT.color;
  const total = Math.max(Number(item.quantity), 1);
  const wh = Number(item.warehouse_qty);
  const allLocs = (item.locations ?? []).filter((l) => Number(l.quantity) > 0);
  const prodLocs = allLocs.filter((l) => l.status !== "DEFECTIVE");
  const prodQtyByDept = new Map<string, number>();
  for (const loc of prodLocs) {
    prodQtyByDept.set(loc.department, (prodQtyByDept.get(loc.department) ?? 0) + Number(loc.quantity));
  }
  const locationLabel = (label: string, quantity: number, reserved: number): string => !showWorkReservations
    ? `${label} ${formatQty(quantity)}`
    : `${label} 실재고 ${formatQty(quantity, { maximumFractionDigits: 6 })}${availabilityKnown ? ` · 가용 ${formatQty(Math.max(quantity - reserved, 0), { maximumFractionDigits: 6 })}` : ""}${reserved > 0 ? ` · 예약 ${formatQty(reserved, { maximumFractionDigits: 6 })}` : ""}`;
  const managedStock = getManagedStockBreakdown(item);
  const segments: { pct: number; color: string; label: string; reservedPct?: number; category?: DefectManagementCategory }[] = [];
  let used = 0;
  if (wh > 0) {
    const pct = Math.min(100, (wh / total) * 100);
    const reserved = reservedAt(null);
    segments.push({ pct, color: compact ? LEGACY_COLORS.cyan : LEGACY_COLORS.green,
      label: locationLabel("창고", wh, reserved),
      reservedPct: Math.min(100, reserved / wh * 100) });
    used += pct;
  }
  for (const [department, quantity] of prodQtyByDept) {
    const pct = Math.min(100 - used, (quantity / total) * 100);
    if (pct <= 0) break;
    const reserved = reservedAt(department);
    segments.push({
      pct,
      color: getDeptColor(department),
      label: locationLabel(department, quantity, reserved),
      reservedPct: Math.min(100, reserved / quantity * 100),
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

  for (const [department, reserved] of reservations) {
    if (department !== null && reserved > 0 && !prodQtyByDept.has(department)) prodQtyByDept.set(department, 0);
  }
  const stockChips: { key: string; label: string; quantity: number; color: string; reserved?: number }[] = [];
  if (wh > 0 || reservedAt(null) > 0) {
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
            style={{ width: `${s.reservedPct}%`,
              backgroundColor: `color-mix(in srgb, ${s.color} 42%, ${LEGACY_COLORS.s1})`,
              backgroundImage: `repeating-linear-gradient(135deg, transparent 0 7px, color-mix(in srgb, ${s.color} 68%, ${LEGACY_COLORS.s1}) 7px 8px)`,
              maskImage: "linear-gradient(to right, transparent, black min(24px, 50%))" }} />}
          {segments[i + 1] && segments[i + 1].color !== s.color && (
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 z-[2]"
              style={{ width: "min(24px, 50%)", background: `linear-gradient(to right, transparent, ${segments[i + 1].color})` }} />
          )}
        </div>
      ))}
    </div>
  );

  if (mode === "bar") return summary && summary.expected_in_quantity > 0 ? <div className="relative">
    {stockBar}
    <span role="img" aria-label="입고 예정 있음" data-testid="inventory-incoming-marker"
      className={`pointer-events-none absolute right-0 ${compact ? "bottom-0.5" : "bottom-[3px]"} inline-flex h-4 w-4 translate-x-full translate-y-1/2 items-center justify-center`}
      style={{ color: summary.forecast_complete ? LEGACY_COLORS.cyan : LEGACY_COLORS.yellow }}>
      <ArrowDownToLine aria-hidden="true" className="h-3.5 w-3.5" />
    </span>
  </div> : stockBar;
  const physicalChips = stockChips.filter((chip) => !showWorkReservations || chip.key !== "pending").map((chip) => {
    const normalStock = showWorkReservations && chip.reserved !== undefined;
    const label = `${chip.label}${normalStock ? availabilityKnown ? " 가용" : " 실재고" : ""}`;
    const quantity = normalStock && availabilityKnown ? Math.max(chip.quantity - chip.reserved!, 0) : chip.quantity;
    const badge = <span key={chip.key}
      className={`inline-flex ${showWorkReservations ? "max-w-full break-words [overflow-wrap:anywhere] " : ""}flex-wrap items-center justify-center gap-x-1 rounded-full border px-2 py-0.5 text-xs font-bold`}
      style={{ color: chip.color, background: `color-mix(in srgb, ${chip.color} 14%, transparent)`, borderColor: `color-mix(in srgb, ${chip.color} 35%, transparent)` }}>
      {label} {formatQty(quantity, { maximumFractionDigits: normalStock ? 6 : 0 })}
    </span>;
    return normalStock ? <div key={chip.key} role="group" aria-label={`${chip.label} 재고`}
      className="flex max-w-full min-w-0 flex-wrap items-center justify-center gap-1.5">
      {badge}
      {!!chip.reserved && <span className="max-w-full rounded-full border px-2 py-0.5 text-xs font-bold break-words [overflow-wrap:anywhere]"
        style={{ color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s3, borderColor: LEGACY_COLORS.border }}>{chip.label} 예약 {formatQty(chip.reserved, { maximumFractionDigits: 6 })}</span>}
    </div> : badge;
  });
  if (showWorkReservations) {
    const incomingQty = summary?.expected_in_quantity ?? 0;
    const incomingLabel = !summary ? null : !summary.forecast_complete
      ? incomingQty > 0 ? `확인된 입고 ${formatQty(incomingQty)}` : "입고 예정 확인 필요"
      : incomingQty > 0 ? `입고 예정 ${formatQty(incomingQty)}` : null;
    const incomingLocations = summary?.forecast_by_location.filter((row) => row.expected_in_quantity > 0).map((row) => {
      const location = row.location.bucket === "warehouse" ? "창고"
        : `${row.location.department}${row.location.bucket === "defective" ? " [불량]" : ""}`;
      return { key: `${row.location.bucket}:${row.location.department}`,
        label: `${location} ${summary.forecast_complete ? "입고 예정" : "확인된 입고"} ${formatQty(row.expected_in_quantity)}` };
    }) ?? [];
    const incomingChips = incomingLocations.length > 0 ? incomingLocations
      : incomingLabel ? [{ key: "unknown", label: `${incomingLabel}${incomingQty > 0 ? " · 위치 확인 필요" : ""}` }] : [];
    const incomingComplete = summary?.forecast_complete && incomingLocations.length > 0;
    const incomingColor = incomingComplete ? LEGACY_COLORS.cyan : LEGACY_COLORS.yellow;
    return <div data-testid="inventory-dept-stock-summary" className="flex min-w-0 flex-col items-center gap-1.5">
      {physicalChips.length > 0 && <div role="group" aria-label="부서별 가용·예약 재고" className="flex max-w-full min-w-0 flex-wrap justify-center gap-1.5">{physicalChips}</div>}
      {unlocatedReserved > 0 && <div role="group" aria-label="위치 미확인 예약" className="flex w-full min-w-0 justify-center">
          <span className="max-w-full rounded-full border px-2 py-0.5 text-xs font-bold break-words [overflow-wrap:anywhere]"
            style={{ color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s3, borderColor: LEGACY_COLORS.border }}>위치 미확인 예약 {formatQty(unlocatedReserved, { maximumFractionDigits: 6 })}</span>
      </div>}
      {incomingChips.length > 0 && <div role="group" aria-label="입고 예정" className="flex w-full min-w-0 flex-col items-center gap-1.5">
        {incomingChips.map((chip) => <div key={chip.key} className="flex w-full min-w-0 justify-center"><span className="inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold"
          style={{ color: incomingColor, background: `color-mix(in srgb, ${incomingColor} 12%, transparent)`, borderColor: `color-mix(in srgb, ${incomingColor} 30%, transparent)` }}>
          {!incomingComplete && <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">{chip.label}</span>
        </span></div>)}
      </div>}
      {physicalChips.length === 0 && unlocatedReserved === 0 && incomingChips.length === 0 && "-"}
    </div>;
  }
  return (
        <div data-testid="inventory-dept-stock-summary" className="flex min-w-0 flex-wrap items-center justify-center gap-1.5">
          {physicalChips.length > 0 ? physicalChips : "-"}
        </div>
  );
}
