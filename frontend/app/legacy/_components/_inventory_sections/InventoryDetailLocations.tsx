"use client";

import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";

/**
 * Round-13 (#8) 추출 — InventoryDetailPanel 의 "위치별 재고" 섹션.
 *
 * 부모에서 `item.warehouse_qty > 0 || locations[*].quantity > 0` 조건 확인 후 렌더.
 */
export function InventoryDetailLocations({
  item,
  getDeptColor,
}: {
  item: Item;
  getDeptColor: (name: string) => string;
}) {
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
            <span className="text-base font-bold" style={{ color: LEGACY_COLORS.text }}>
              {formatQty(item.warehouse_qty)}
            </span>
          </div>
        )}
        {(item.locations ?? [])
          .filter((l) => Number(l.quantity) > 0)
          .map((l) => (
            <div
              key={l.department}
              className="flex items-center gap-3 rounded-[14px] border px-3 py-2.5"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
            >
              <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: getDeptColor(l.department) }} />
              <span className="flex-1 text-base font-semibold">{l.department}</span>
              <span className="text-base font-bold" style={{ color: LEGACY_COLORS.text }}>
                {formatQty(l.quantity)}
              </span>
            </div>
          ))}
      </div>
    </section>
  );
}
