"use client";

import clsx from "clsx";
import { Check } from "lucide-react";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "../../legacyUi";
import { erpCodeDeptBadge } from "@/lib/mes/process";
import { getStockState } from "@/lib/mes/inventory";
import { formatErpCode, formatQty } from "@/lib/mes/format";
import { useDeptColorLookup } from "../../DepartmentsContext";
import { TYPO } from "../tokens";
import { StatusBadge } from "./StatusBadge";

export function ItemRow({
  item,
  onClick,
  selected = false,
  showCheckbox = false,
  right,
  dense = false,
  className,
}: {
  item: Item;
  onClick?: () => void;
  selected?: boolean;
  showCheckbox?: boolean;
  right?: React.ReactNode;
  dense?: boolean;
  className?: string;
}) {
  const getDeptColor = useDeptColorLookup();
  const state = getStockState(Number(item.quantity), item.min_stock);
  const deptBadge = erpCodeDeptBadge(item.erp_code, getDeptColor);
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
      {showCheckbox ? (
        // 시각 22×22 유지 + 외곽 44×44 hit-area (WCAG 2.5.5)
        <span
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center"
          aria-hidden
        >
          <span
            className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border transition-colors"
            style={{
              background: selected ? LEGACY_COLORS.blue : "transparent",
              borderColor: selected ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
            }}
          >
            {selected ? <Check size={13} strokeWidth={3} color="#fff" /> : null}
          </span>
        </span>
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div
            className={clsx(TYPO.body, "min-w-0 truncate font-black")}
            style={{ color: LEGACY_COLORS.text }}
          >
            {item.item_name}
          </div>
          <div
            className={clsx(TYPO.title, "shrink-0 font-black tabular-nums")}
            style={{ color: state.color }}
          >
            {formatQty(item.quantity)}
          </div>
        </div>
        <div className="mt-[3px] flex items-center gap-[6px]">
          <div
            className={clsx(TYPO.caption, "truncate")}
            style={{ color: LEGACY_COLORS.muted }}
          >
            {erpCompact ?? "-"}
          </div>
          {deptBadge ? (
            <StatusBadge label={deptBadge.label} color={deptBadge.color} className="shrink-0" />
          ) : null}
          <StatusBadge
            label={state.label}
            color={state.color}
            dot
            className="shrink-0 ml-auto"
          />
        </div>
        {item.spec ? (
          <div
            className={clsx(TYPO.caption, "mt-[2px] truncate")}
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            {item.spec}
          </div>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </button>
  );
}
