"use client";

import { X } from "lucide-react";
import { type Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { mesCodeDeptBadge } from "@/lib/mes/process";
import { getStockState } from "@/lib/mes/inventory";
import { formatQty } from "@/lib/mes/format";
import { useDeptColorLookup } from "./DepartmentsContext";
import { QuantityStepper } from "./_warehouse_v2/QuantityStepper";

export type SelectedEntry = { item: Item; quantity: number };

interface Props {
  entries: SelectedEntry[];
  onQuantityChange: (itemId: string, qty: number) => void;
  onRemove: (itemId: string) => void;
  outgoing?: boolean;
}

export function SelectedItemsPanel({ entries, onQuantityChange, onRemove, outgoing = false }: Props) {
  const getDeptColor = useDeptColorLookup();
  if (entries.length === 0) return null;

  return (
    <div>
      {entries.map(({ item, quantity }) => {
        const stock = getStockState(Number(item.quantity), item.min_stock == null ? null : Number(item.min_stock));
        const deptBadge = mesCodeDeptBadge(item.mes_code, getDeptColor);
        const expected = outgoing
          ? Number(item.quantity) - quantity
          : Number(item.quantity) + quantity;
        const isShortage = outgoing && expected < 0;
        const expectedColor =
          expected < 0 ? LEGACY_COLORS.red : expected === 0 ? LEGACY_COLORS.yellow : LEGACY_COLORS.green;

        return (
          <div
            key={item.item_id}
            className="grid grid-cols-[minmax(0,2fr)_minmax(70px,auto)_auto_minmax(72px,auto)_minmax(72px,auto)_32px] items-center gap-3 px-4 py-3"
            style={{
              borderBottom: `1px solid ${LEGACY_COLORS.border}`,
              background: isShortage
                ? `color-mix(in srgb, ${LEGACY_COLORS.red} 8%, transparent)`
                : "transparent",
            }}
          >
            {/* 품목명 + 품목 코드 */}
            <div className="min-w-0">
              <div className="truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
                {item.item_name}
              </div>
              <div className="truncate text-[11px] font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
                {item.mes_code ?? "-"}
              </div>
            </div>

            {/* 분류 배지 */}
            {deptBadge ? (
              <span
                className="justify-self-start rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ color: deptBadge.color, background: deptBadge.bg }}
              >
                {deptBadge.label}
              </span>
            ) : (
              <span className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>-</span>
            )}

            {/* 스테퍼 */}
            <QuantityStepper
              value={quantity}
              min={1}
              step={1}
              onChange={(next) => onQuantityChange(item.item_id, next)}
            />

            {/* 현재 재고 */}
            <div className="text-right">
              <div className="text-[9px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
                현재 재고
              </div>
              <div className="text-base font-black tabular-nums" style={{ color: stock.color }}>
                {formatQty(item.quantity)}
              </div>
            </div>

            {/* 실행 후 재고 */}
            <div className="text-right">
              <div className="text-[9px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
                실행 후
              </div>
              <div className="text-base font-black tabular-nums" style={{ color: expectedColor }}>
                {formatQty(expected)}
              </div>
              {isShortage && (
                <div className="text-[9px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.red }}>
                  재고 부족
                </div>
              )}
            </div>

            {/* 제거 */}
            <button
              onClick={() => onRemove(item.item_id)}
              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10"
              style={{ color: LEGACY_COLORS.muted2 }}
              title="선택 해제"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
