"use client";

import { useRouter } from "next/navigation";
import { defectEntryUrl, type DefectEntryTarget } from "@/lib/defect-entry";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { findInventoryLocation, getStockState, locationAvailable, locationPending, warehouseAvailable, warehousePending } from "@/lib/mes/inventory";
import { getManagedStockBreakdown, STOCK_CATEGORY_ORDER, STOCK_CATEGORY_STYLES } from "./inventoryManagedStock";

/**
 * Round-13 (#8) 추출 — InventoryDetailPanel 의 "위치별 재고" 섹션.
 *
 * 부모에서 `item.warehouse_qty > 0 || locations[*].quantity > 0` 조건 확인 후 렌더.
 * 부서별 정상 행 다음에 불량·B급·구형을 각각 표시한다.
 */
export function InventoryDetailLocations({
  item,
  getDeptColor,
  mobile = false,
  onGoToDefect,
}: {
  item: Item;
  getDeptColor: (name: string) => string;
  mobile?: boolean;
  onGoToDefect?: (target: DefectEntryTarget) => void;
}) {
  const router = useRouter();

  // 부서 목록 (PRODUCTION + DEFECTIVE 모두 포함, quantity > 0)
  const locations = (item.locations ?? []).filter((l) => Number(l.quantity) > 0);
  const managedStock = getManagedStockBreakdown(item);
  // 등장하는 부서 순서 유지 (PRODUCTION 기준 정렬)
  const depts = Array.from(
    new Set([...locations.map((l) => l.department), ...managedStock.map((entry) => entry.department)])
  );
  const summary = item.work_reservations;
  const availableColor = getStockState(Number(item.available_quantity), item.min_stock).color;
  const reservedAt = (department: string | null): number => summary?.reservation_by_location
    .filter((row) => row.location.bucket === (department == null ? "warehouse" : "production") && row.location.department === department)
    .reduce((sum, row) => sum + row.work_reserved_quantity + row.approval_reserved_quantity + row.shipping_reserved_quantity, 0) ?? 0;
  const warehousePendingQty = summary ? reservedAt(null) : warehousePending(item);
  const warehouseAvailableQty = summary ? Number(item.warehouse_qty) - warehousePendingQty : warehouseAvailable(item);
  const stockRowClass = "flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 rounded-[14px] border px-3 py-2.5";
  const stockRowStyle = { background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border };

  return (
    <section
      data-panel-scroll-card={!mobile || undefined}
      className={mobile ? "rounded-[20px] border p-3" : "rounded-[28px] border p-5"}
      style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
    >
      <div className={mobile ? "mb-2 text-sm font-semibold" : "mb-3 text-sm font-bold uppercase tracking-[0.18em]"} style={{ color: mobile ? LEGACY_COLORS.text : LEGACY_COLORS.muted2 }}>
        위치별 재고
      </div>
      <div className="space-y-2">
        {Number(item.warehouse_qty) > 0 && (
          <div
            className={stockRowClass}
            style={stockRowStyle}
          >
            <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: LEGACY_COLORS.muted2 }} />
            <span className="min-w-0 flex-1 break-words text-sm font-medium">창고</span>
            {warehousePendingQty > 0 ? (
              <div className="ml-auto flex max-w-full flex-wrap items-baseline justify-end gap-x-1 text-right leading-tight tabular-nums">
                <span className="whitespace-nowrap text-xs font-semibold" style={{ color: availableColor }}>출고 가능 {formatQty(warehouseAvailableQty)}</span>
                <span aria-hidden="true" className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>·</span>
                <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>실재고 {formatQty(item.warehouse_qty)} · 예약 {formatQty(warehousePendingQty)}</span>
              </div>
            ) : (
              <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: availableColor }}>
                {formatQty(item.warehouse_qty)}
              </span>
            )}
          </div>
        )}
        {depts.map((dept) => {
          const prod = findInventoryLocation(item, dept, "PRODUCTION");
          const prodPending = summary ? reservedAt(dept) : locationPending(prod);
          const prodAvailable = summary ? Number(prod?.quantity ?? 0) - prodPending : locationAvailable(prod);
          const managedRows = STOCK_CATEGORY_ORDER.flatMap((category) => managedStock
            .filter((entry) => entry.department === dept && entry.management_category === category));
          return (
            <div key={dept}>
              {prod && (
                <div
                  className={stockRowClass}
                  style={stockRowStyle}
                >
                  <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: getDeptColor(dept) }} />
                  <span className="min-w-0 flex-1 break-words text-sm font-medium">{dept}</span>
                  {prodPending > 0 ? (
                    <div className="ml-auto flex max-w-full flex-wrap items-baseline justify-end gap-x-1 text-right leading-tight tabular-nums">
                      <span className="whitespace-nowrap text-xs font-semibold" style={{ color: availableColor }}>출고 가능 {formatQty(prodAvailable)}</span>
                      <span aria-hidden="true" className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>·</span>
                      <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>실재고 {formatQty(prod.quantity)} · 예약 {formatQty(prodPending)}</span>
                    </div>
                  ) : (
                    <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: availableColor }}>
                      {formatQty(prod.quantity)}
                    </span>
                  )}
                </div>
              )}
              {managedRows.map((entry) => {
                const { label, color } = STOCK_CATEGORY_STYLES[entry.management_category];
                const stockColor = entry.management_category === "DEFECT" && mobile ? LEGACY_COLORS.red : color;
                // 이전 API의 위치 예약만 유지한다. 새 집계에는 분류별 예약 정보가 없다.
                const legacyLocation = item.defective_breakdown == null ? findInventoryLocation(item, dept, "DEFECTIVE") : undefined;
                return (
                  <button
                    key={entry.management_category}
                    type="button"
                    onClick={() => {
                      const target = { itemId: item.item_id, department: dept, managementCategory: entry.management_category };
                      if (onGoToDefect) onGoToDefect(target);
                      else router.push(defectEntryUrl(window.location.pathname, target));
                    }}
                    className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-[14px] border px-3 py-2.5 text-left transition-opacity hover:opacity-80"
                    style={{ background: `color-mix(in srgb, ${stockColor} 10%, ${LEGACY_COLORS.s1})`, borderColor: `color-mix(in srgb, ${stockColor} 60%, ${LEGACY_COLORS.border})` }}
                    aria-label={`${dept} ${label} ${formatQty(entry.quantity)} — 불량 탭으로 이동`}
                  >
                    <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: stockColor }} />
                    <span className="min-w-0 flex-1 break-words text-sm font-medium" style={{ color: stockColor }}>
                      {dept} [{label}]
                    </span>
                    {locationPending(legacyLocation) > 0 ? (
                      <div className="ml-auto flex max-w-full flex-wrap items-baseline justify-end gap-x-1 text-right leading-tight tabular-nums">
                        <span className="whitespace-nowrap text-xs font-semibold" style={{ color: stockColor }}>출고 가능 {formatQty(locationAvailable(legacyLocation))}</span>
                        <span aria-hidden="true" className="text-xs" style={{ color: stockColor }}>·</span>
                        <span className="text-xs" style={{ color: stockColor }}>실재고 {formatQty(entry.quantity)} · 예약 {formatQty(locationPending(legacyLocation))}</span>
                      </div>
                    ) : (
                      <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: stockColor }}>
                        {formatQty(entry.quantity)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
