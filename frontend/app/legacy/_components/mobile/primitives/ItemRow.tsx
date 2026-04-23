"use client";

import clsx from "clsx";
import type { Item } from "@/lib/api";
import {
  erpCodeDeptBadge,
  formatErpCode,
  formatNumber,
  getStockState,
  LEGACY_COLORS,
} from "../../legacyUi";
import { TYPO } from "../tokens";
import { StatusBadge } from "./StatusBadge";

export function ItemRow({
  item,
  onClick,
  selected = false,
  right,
  dense = false,
  className,
}: {
  item: Item;
  onClick?: () => void;
  selected?: boolean;
  right?: React.ReactNode;
  dense?: boolean;
  className?: string;
}) {
  const state = getStockState(Number(item.quantity), item.min_stock);
  const deptBadge = erpCodeDeptBadge(item.erp_code);
  const erpCompact = formatErpCode(item.erp_code);

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-3 rounded-[20px] border px-3 text-left active:scale-[0.99]",
        dense ? "py-[10px]" : "py-3",
        className,
      )}
      style={{
        background: selected ? `${LEGACY_COLORS.blue as string}14` : LEGACY_COLORS.s2,
        borderColor: selected ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className={clsx(TYPO.body, "truncate font-black")} style={{ color: LEGACY_COLORS.text }}>
            {item.item_name}
          </div>
          {deptBadge ? (
            <StatusBadge label={deptBadge.label} color={deptBadge.color} className="shrink-0" />
          ) : null}
        </div>
        <div className="mt-[2px] flex items-center gap-2">
          <div className={clsx(TYPO.caption, "truncate font-mono")} style={{ color: LEGACY_COLORS.muted }}>
            {erpCompact ?? "-"}
          </div>
          {item.spec ? (
            <div className={clsx(TYPO.caption, "truncate")} style={{ color: LEGACY_COLORS.muted2 }}>
              · {item.spec}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className={clsx(TYPO.title, "font-black tabular-nums")} style={{ color: state.color }}>
          {formatNumber(item.quantity)}
        </div>
        <StatusBadge label={state.label} color={state.color} dot />
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </button>
  );
}
