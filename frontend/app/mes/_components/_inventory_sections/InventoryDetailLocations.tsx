"use client";

import { useRouter } from "next/navigation";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { findInventoryLocation, locationAvailable, locationPending, warehouseAvailable, warehousePending } from "@/lib/mes/inventory";
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
}: {
  item: Item;
  getDeptColor: (name: string) => string;
  mobile?: boolean;
}) {
  const router = useRouter();

  // 부서 목록 (PRODUCTION + DEFECTIVE 모두 포함, quantity > 0)
  const locations = (item.locations ?? []).filter((l) => Number(l.quantity) > 0);
  const managedStock = getManagedStockBreakdown(item);
  // 등장하는 부서 순서 유지 (PRODUCTION 기준 정렬)
  const depts = Array.from(
    new Set([...locations.map((l) => l.department), ...managedStock.map((entry) => entry.department)])
  );
  const warehousePendingQty = warehousePending(item);
  const warehouseAvailableQty = warehouseAvailable(item);

  return (
    <section
      className={mobile ? "rounded-[20px] border px-3 py-2" : "rounded-[28px] border p-5"}
      style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
    >
      <div className={mobile ? "mb-1 text-sm font-semibold" : "mb-3 text-sm font-bold uppercase tracking-[0.18em]"} style={{ color: mobile ? LEGACY_COLORS.text : LEGACY_COLORS.muted2 }}>
        위치별 재고
      </div>
      <div className="space-y-2">
        {Number(item.warehouse_qty) > 0 && (
          <div
            className={mobile ? "flex min-h-11 items-center gap-3 rounded-[14px] border px-3 py-2" : "flex items-center gap-3 rounded-[14px] border px-3 py-2.5"}
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
          >
            <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: LEGACY_COLORS.muted2 }} />
            <span className={mobile ? "min-w-0 flex-1 break-words text-sm font-medium" : "flex-1 text-base font-semibold"}>창고</span>
            {warehousePendingQty > 0 ? (
              <div className="flex flex-col items-end leading-tight">
                <span className="text-base font-bold" style={{ color: LEGACY_COLORS.text }}>출고 가능 {formatQty(warehouseAvailableQty)}</span>
                <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>실재고 {formatQty(item.warehouse_qty)} · 예약 {formatQty(warehousePendingQty)}</span>
              </div>
            ) : (
              <span className={mobile ? "min-w-11 rounded-[8px] px-2 py-1 text-center font-sans text-base font-medium" : "text-base font-bold"} style={{ color: LEGACY_COLORS.text, ...(mobile ? { background: LEGACY_COLORS.s3 } : {}) }}>
                {formatQty(item.warehouse_qty)}
              </span>
            )}
          </div>
        )}
        {depts.map((dept) => {
          const prod = findInventoryLocation(item, dept, "PRODUCTION");
          const managedRows = STOCK_CATEGORY_ORDER.flatMap((category) => managedStock
            .filter((entry) => entry.department === dept && entry.management_category === category));
          return (
            <div key={dept}>
              {prod && (
                <div
                  className={mobile ? "flex min-h-11 items-center gap-3 rounded-[14px] border px-3 py-2" : "flex items-center gap-3 rounded-[14px] border px-3 py-2.5"}
                  style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
                >
                  <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: getDeptColor(dept) }} />
                  <span className={mobile ? "min-w-0 flex-1 break-words text-sm font-medium" : "flex-1 text-base font-semibold"}>{dept}</span>
                  {locationPending(prod) > 0 ? (
                    <div className="flex flex-col items-end leading-tight">
                      <span className="text-base font-bold" style={{ color: LEGACY_COLORS.text }}>출고 가능 {formatQty(locationAvailable(prod))}</span>
                      <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>실재고 {formatQty(prod.quantity)} · 예약 {formatQty(locationPending(prod))}</span>
                    </div>
                  ) : (
                    <span className={mobile ? "min-w-11 rounded-[8px] px-2 py-1 text-center font-sans text-base font-medium" : "text-base font-bold"} style={{ color: LEGACY_COLORS.text, ...(mobile ? { background: LEGACY_COLORS.s3 } : {}) }}>
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
                    onClick={() => router.push("/?tab=defect")}
                    className={`mt-1 flex w-full items-center gap-3 rounded-[14px] border px-3 py-2.5 text-left transition-opacity hover:opacity-80 ${mobile ? "min-h-11" : ""}`}
                    style={{ background: mobile ? LEGACY_COLORS.s1 : `color-mix(in srgb, ${stockColor} 10%, transparent)`, borderColor: mobile ? LEGACY_COLORS.border : stockColor }}
                    aria-label={`${dept} ${label} ${formatQty(entry.quantity)} — 불량 탭으로 이동`}
                  >
                    <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: stockColor }} />
                    <span className={mobile ? "min-w-0 flex-1 break-words text-sm font-medium" : "flex-1 text-base font-semibold"} style={{ color: stockColor }}>
                      {dept} [{label}]
                    </span>
                    {locationPending(legacyLocation) > 0 ? (
                      <div className="flex flex-col items-end leading-tight">
                        <span className="text-base font-bold" style={{ color: stockColor }}>출고 가능 {formatQty(locationAvailable(legacyLocation))}</span>
                        <span className="text-xs" style={{ color: stockColor }}>실재고 {formatQty(entry.quantity)} · 예약 {formatQty(locationPending(legacyLocation))}</span>
                      </div>
                    ) : (
                      <span className={mobile ? "min-w-11 rounded-[8px] px-2 py-1 text-center font-sans text-base font-medium" : "text-base font-bold"} style={{ color: stockColor, ...(mobile ? { background: LEGACY_COLORS.s3 } : {}) }}>
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
