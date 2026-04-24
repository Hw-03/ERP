"use client";

import { X } from "lucide-react";
import { type Item } from "@/lib/api";
import { LEGACY_COLORS, erpCodeDeptBadge, formatNumber, getStockState } from "./legacyUi";

export type SelectedEntry = { item: Item; quantity: number };

interface Props {
  entries: SelectedEntry[];
  onQuantityChange: (itemId: string, qty: number) => void;
  onRemove: (itemId: string) => void;
  outgoing?: boolean;
}

export function SelectedItemsPanel({ entries, onQuantityChange, onRemove, outgoing = false }: Props) {
  if (entries.length === 0) return null;

  return (
    <div className="space-y-2">
      {entries.map(({ item, quantity }) => {
        const stock = getStockState(Number(item.quantity), item.min_stock == null ? null : Number(item.min_stock));
        const deptBadge = erpCodeDeptBadge(item.erp_code);
        const expected = outgoing
          ? Number(item.quantity) - quantity
          : Number(item.quantity) + quantity;

        return (
          <div
            key={item.item_id}
            className="rounded-[18px] border p-3"
            style={{
              background: LEGACY_COLORS.s1,
              borderColor: LEGACY_COLORS.border,
              borderLeft: `3px solid ${LEGACY_COLORS.blue}`,
            }}
          >
            {/* 품목 정보 행 */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[12px] font-bold truncate" style={{ color: LEGACY_COLORS.text }}>
                    {item.item_name}
                  </span>
                  {deptBadge && (
                    <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: deptBadge.color, background: deptBadge.bg }}>
                      {deptBadge.label}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  {item.erp_code}
                </div>
              </div>
              <button
                onClick={() => onRemove(item.item_id)}
                className="shrink-0 rounded-full p-1 transition-colors hover:bg-white/10"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* 재고 미리보기 */}
            <div className="mt-2 flex items-center gap-2 text-[11px]">
              <span style={{ color: LEGACY_COLORS.muted2 }}>현재고</span>
              <span className="font-bold" style={{ color: stock.color }}>{formatNumber(item.quantity)}</span>
              <span style={{ color: LEGACY_COLORS.muted2 }}>→</span>
              <span
                className="font-bold"
                style={{ color: expected < 0 ? LEGACY_COLORS.red : expected === 0 ? LEGACY_COLORS.yellow : LEGACY_COLORS.green }}
              >
                {formatNumber(expected)}
              </span>
            </div>

            {/* 수량 스테퍼 */}
            <div className="mt-2.5 flex items-center gap-1">
              {([-10, -1, 1, 10] as const).map((delta) => (
                <button
                  key={delta}
                  onClick={() => onQuantityChange(item.item_id, Math.max(1, quantity + delta))}
                  className="rounded-[9px] border px-2 py-1 text-[11px] font-bold transition-colors hover:brightness-110"
                  style={{
                    background: delta < 0 ? "rgba(242,95,92,.12)" : "rgba(31,209,122,.12)",
                    borderColor: delta < 0 ? "rgba(242,95,92,.3)" : "rgba(31,209,122,.3)",
                    color: delta < 0 ? LEGACY_COLORS.red : LEGACY_COLORS.green,
                  }}
                >
                  {delta > 0 ? `+${delta}` : delta}
                </button>
              ))}
              <div
                className="flex-1 rounded-[9px] border px-3 py-1 text-center text-sm font-black"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              >
                {formatNumber(quantity)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
