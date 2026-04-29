"use client";

import { GripVertical, X } from "lucide-react";
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
    <div>
      {entries.map(({ item, quantity }) => {
        const stock = getStockState(Number(item.quantity), item.min_stock == null ? null : Number(item.min_stock));
        const deptBadge = erpCodeDeptBadge(item.erp_code);
        const expected = outgoing
          ? Number(item.quantity) - quantity
          : Number(item.quantity) + quantity;
        const isShortage = outgoing && expected < 0;
        const expectedColor =
          expected < 0 ? LEGACY_COLORS.red : expected === 0 ? LEGACY_COLORS.yellow : LEGACY_COLORS.green;

        return (
          <div
            key={item.item_id}
            className="grid grid-cols-[16px_minmax(0,2fr)_minmax(70px,auto)_auto_minmax(72px,auto)_minmax(72px,auto)_32px] items-center gap-3 px-4 py-3"
            style={{
              borderBottom: `1px solid ${LEGACY_COLORS.border}`,
              background: isShortage
                ? `color-mix(in srgb, ${LEGACY_COLORS.red} 8%, transparent)`
                : "transparent",
            }}
          >
            {/* 그립 */}
            <GripVertical className="h-4 w-4" style={{ color: LEGACY_COLORS.muted2 }} />

            {/* 품목명 + 품목 코드 */}
            <div className="min-w-0">
              <div className="truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
                {item.item_name}
              </div>
              <div className="truncate text-[11px] font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
                {item.erp_code ?? "-"}
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
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[9px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
                수량
              </span>
              <div className="flex items-center gap-1">
                <StepBtn tone={LEGACY_COLORS.red} onClick={() => onQuantityChange(item.item_id, Math.max(1, quantity - 10))}>-10</StepBtn>
                <StepBtn tone={LEGACY_COLORS.red} onClick={() => onQuantityChange(item.item_id, Math.max(1, quantity - 1))}>-1</StepBtn>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => onQuantityChange(item.item_id, Math.max(1, Number(e.target.value) || 1))}
                  className="w-[72px] rounded-[10px] border px-2 py-1.5 text-center text-sm font-black tabular-nums outline-none"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                />
                <StepBtn tone={LEGACY_COLORS.green} onClick={() => onQuantityChange(item.item_id, quantity + 1)}>+1</StepBtn>
                <StepBtn tone={LEGACY_COLORS.green} onClick={() => onQuantityChange(item.item_id, quantity + 10)}>+10</StepBtn>
              </div>
            </div>

            {/* 현재 재고 */}
            <div className="text-right">
              <div className="text-[9px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
                현재 재고
              </div>
              <div className="text-base font-black tabular-nums" style={{ color: stock.color }}>
                {formatNumber(item.quantity)}
              </div>
            </div>

            {/* 실행 후 재고 */}
            <div className="text-right">
              <div className="text-[9px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
                실행 후
              </div>
              <div className="text-base font-black tabular-nums" style={{ color: expectedColor }}>
                {formatNumber(expected)}
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

function StepBtn({ tone, onClick, children }: { tone: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-[10px] border px-2.5 py-1.5 text-xs font-black transition-colors hover:brightness-110"
      style={{
        background: `color-mix(in srgb, ${tone} 10%, transparent)`,
        borderColor: `color-mix(in srgb, ${tone} 30%, transparent)`,
        color: tone,
      }}
    >
      {children}
    </button>
  );
}
