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
      label: `창고 ${formatQty(wh)}${reserved > 0 ? ` · 예약 ${formatQty(reserved)}` : ""}`,
      reservedPct: Math.min(100, reserved / wh * 100) });
    used += pct;
  }
  for (const loc of prodLocs) {
    const pct = Math.min(100 - used, (Number(loc.quantity) / total) * 100);
    if (pct <= 0) break;
    const reserved = reservedAt(loc.department);
    segments.push({
      pct,
      color: getDeptColor(loc.department),
      label: `${loc.department} ${formatQty(loc.quantity)}${reserved > 0 ? ` · 예약 ${formatQty(reserved)}` : ""}`,
      reservedPct: Math.min(100, reserved / Number(loc.quantity) * 100),
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
  const stockChips: { key: string; label: string; quantity: number; color: string }[] = [];
  if (wh > 0) {
    stockChips.push({ key: "warehouse", label: "창고", quantity: wh, color: LEGACY_COLORS.green });
  }
  if (!summary && pendingQty > 0) {
    stockChips.push({ key: "pending", label: "예약", quantity: pendingQty, color: LEGACY_COLORS.yellow });
  }
  for (const [dept, quantity] of Array.from(prodQtyByDept)) {
    stockChips.push({ key: `dept-${dept}`, label: dept, quantity, color: getDeptColor(dept) });
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

  if (mode === "bar") return summary && summary.expected_in_quantity > 0 ? <div className="relative">
    {stockBar}
    <span role="img" aria-label="입고 예정 있음" data-testid="inventory-incoming-marker"
      className={`pointer-events-none absolute right-0 ${compact ? "bottom-0.5" : "bottom-[3px]"} inline-flex h-4 w-4 translate-x-full translate-y-1/2 items-center justify-center`}
      style={{ color: summary.forecast_complete ? LEGACY_COLORS.cyan : LEGACY_COLORS.yellow }}>
      <ArrowDownToLine aria-hidden="true" className="h-3.5 w-3.5" />
    </span>
  </div> : stockBar;
  const physicalChips = stockChips.filter((chip) => !showWorkReservations || chip.key !== "pending").map((chip) => (
    <span key={chip.key}
      className={`inline-flex ${showWorkReservations ? "max-w-full " : ""}flex-wrap items-center justify-center gap-x-1 rounded-full border px-2 py-0.5 text-xs font-bold`}
      style={{ color: chip.color, background: `color-mix(in srgb, ${chip.color} 14%, transparent)`, borderColor: `color-mix(in srgb, ${chip.color} 35%, transparent)` }}>
      <span className={showWorkReservations ? "min-w-0 break-words [overflow-wrap:anywhere]" : "whitespace-nowrap"}>{chip.label} {formatQty(chip.quantity)}</span>
    </span>
  ));
  if (showWorkReservations) {
    const reservedQuantity = summary ? summary.work_reserved_quantity + summary.approval_reserved_quantity : pendingQty;
    const reservationChips = summary?.reservation_by_requester_department?.length ? summary.reservation_by_requester_department
      .map((row) => ({ key: row.requester_department ?? "unknown",
        label: row.requester_department ?? "부서 미확인",
        quantity: row.work_reserved_quantity + row.approval_reserved_quantity }))
      .filter((row) => row.quantity > 0)
      : reservedQuantity > 0 ? [{ key: "unknown", label: "부서 미확인", quantity: reservedQuantity }] : [];
    if (summary && summary.shipping_reserved_quantity > 0) {
      reservationChips.push({ key: "shipping", label: "출하", quantity: summary.shipping_reserved_quantity });
    }
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
      {physicalChips.length > 0 && <div role="group" aria-label="현재고" className="flex max-w-full min-w-0 flex-wrap justify-center gap-1.5">{physicalChips}</div>}
      {reservationChips.length > 0 && <div role="group" aria-label="예약 재고" className="flex w-full min-w-0 flex-col items-center gap-1.5">
        {reservationChips.map((chip) => <div key={chip.key} className="flex w-full min-w-0 justify-center">
          <span className="max-w-full rounded-full border px-2 py-0.5 text-xs font-bold break-words [overflow-wrap:anywhere]"
            style={{ color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s3, borderColor: LEGACY_COLORS.border }}>{chip.label ? `${chip.label} ` : ""}예약 {formatQty(chip.quantity)}</span>
        </div>)}
      </div>}
      {incomingChips.length > 0 && <div role="group" aria-label="입고 예정" className="flex w-full min-w-0 flex-col items-center gap-1.5">
        {incomingChips.map((chip) => <div key={chip.key} className="flex w-full min-w-0 justify-center"><span className="inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold"
          style={{ color: incomingColor, background: `color-mix(in srgb, ${incomingColor} 12%, transparent)`, borderColor: `color-mix(in srgb, ${incomingColor} 30%, transparent)` }}>
          {!incomingComplete && <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">{chip.label}</span>
        </span></div>)}
      </div>}
      {physicalChips.length === 0 && reservationChips.length === 0 && incomingChips.length === 0 && "-"}
    </div>;
  }
  return (
        <div data-testid="inventory-dept-stock-summary" className="flex min-w-0 flex-wrap items-center justify-center gap-1.5">
          {physicalChips.length > 0 ? physicalChips : "-"}
        </div>
  );
}
