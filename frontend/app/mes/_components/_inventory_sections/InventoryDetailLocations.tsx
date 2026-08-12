"use client";

import { useRouter } from "next/navigation";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { findInventoryLocation, locationAvailable, locationPending, warehouseAvailable, warehousePending } from "@/lib/mes/inventory";

const DEFECT_RED = "#ef4444";

/**
 * Round-13 (#8) 추출 — InventoryDetailPanel 의 "위치별 재고" 섹션.
 *
 * 부모에서 `item.warehouse_qty > 0 || locations[*].quantity > 0` 조건 확인 후 렌더.
 * PR#3: DEFECTIVE 행 빨간색 추가. 부서별 정상 행 바로 다음에 인접 배치.
 */
export function InventoryDetailLocations({
  item,
  getDeptColor,
}: {
  item: Item;
  getDeptColor: (name: string) => string;
}) {
  const router = useRouter();

  // 부서 목록 (PRODUCTION + DEFECTIVE 모두 포함, quantity > 0)
  const locations = (item.locations ?? []).filter((l) => Number(l.quantity) > 0);
  // 등장하는 부서 순서 유지 (PRODUCTION 기준 정렬)
  const depts = Array.from(
    new Set(locations.map((l) => l.department))
  );
  const warehousePendingQty = warehousePending(item);
  const warehouseAvailableQty = warehouseAvailable(item);

  return (
    <section
      className="rounded-[28px] border p-5"
      style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
    >
      <div className="mb-3 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
        위치별 재고
      </div>
      <div className="space-y-2">
        {Number(item.warehouse_qty) > 0 && (
          <div
            className="flex items-center gap-3 rounded-[14px] border px-3 py-2.5"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
          >
            <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: LEGACY_COLORS.muted2 }} />
            <span className="flex-1 text-base font-semibold">창고</span>
            {warehousePendingQty > 0 ? (
              <div className="flex flex-col items-end leading-tight">
                <span className="text-base font-bold" style={{ color: LEGACY_COLORS.text }}>출고 가능 {formatQty(warehouseAvailableQty)}</span>
                <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>실재고 {formatQty(item.warehouse_qty)} · 예약 {formatQty(warehousePendingQty)}</span>
              </div>
            ) : (
              <span className="text-base font-bold" style={{ color: LEGACY_COLORS.text }}>
                {formatQty(item.warehouse_qty)}
              </span>
            )}
          </div>
        )}
        {depts.map((dept) => {
          const prod = findInventoryLocation(item, dept, "PRODUCTION");
          const defective = findInventoryLocation(item, dept, "DEFECTIVE");
          return (
            <div key={dept}>
              {prod && (
                <div
                  className="flex items-center gap-3 rounded-[14px] border px-3 py-2.5"
                  style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
                >
                  <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: getDeptColor(dept) }} />
                  <span className="flex-1 text-base font-semibold">{dept}</span>
                  {locationPending(prod) > 0 ? (
                    <div className="flex flex-col items-end leading-tight">
                      <span className="text-base font-bold" style={{ color: LEGACY_COLORS.text }}>출고 가능 {formatQty(locationAvailable(prod))}</span>
                      <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>실재고 {formatQty(prod.quantity)} · 예약 {formatQty(locationPending(prod))}</span>
                    </div>
                  ) : (
                    <span className="text-base font-bold" style={{ color: LEGACY_COLORS.text }}>
                      {formatQty(prod.quantity)}
                    </span>
                  )}
                </div>
              )}
              {defective && (
                <button
                  type="button"
                  onClick={() => router.push("/?tab=defect")}
                  className="mt-1 flex w-full items-center gap-3 rounded-[14px] border px-3 py-2.5 text-left transition-opacity hover:opacity-80"
                  style={{ background: "color-mix(in srgb, #ef4444 10%, transparent)", borderColor: DEFECT_RED }}
                  aria-label={`${dept} 불량 ${formatQty(defective.quantity)} — 불량 탭으로 이동`}
                >
                  <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: DEFECT_RED }} />
                  <span className="flex-1 text-base font-semibold" style={{ color: DEFECT_RED }}>
                    {dept} [불량]
                  </span>
                  {locationPending(defective) > 0 ? (
                    <div className="flex flex-col items-end leading-tight">
                      <span className="text-base font-bold" style={{ color: DEFECT_RED }}>출고 가능 {formatQty(locationAvailable(defective))}</span>
                      <span className="text-xs" style={{ color: DEFECT_RED }}>실재고 {formatQty(defective.quantity)} · 예약 {formatQty(locationPending(defective))}</span>
                    </div>
                  ) : (
                    <span className="text-base font-bold" style={{ color: DEFECT_RED }}>
                      {formatQty(defective.quantity)}
                    </span>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
