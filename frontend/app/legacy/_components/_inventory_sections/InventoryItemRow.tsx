"use client";

import { memo } from "react";
import type { Item } from "@/lib/api";
import {
  LEGACY_COLORS,
  employeeColor,
  erpCodeDept,
  formatNumber,
  getStockState,
} from "../legacyUi";

function safeQty(item: Item) {
  const n = Number(item.quantity);
  return isNaN(n) ? 0 : n;
}

function getMinStock(item: Item) {
  return item.min_stock == null ? 0 : Number(item.min_stock);
}

type Props = {
  item: Item;
  selected: boolean;
  onSelect: (item: Item | null) => void;
};

function InventoryItemRowImpl({ item, selected, onSelect }: Props) {
  const minStock = getMinStock(item);
  const stock = getStockState(safeQty(item), minStock === 0 ? null : minStock);
  const qty = safeQty(item);
  const isCritical = qty <= 0 || (minStock > 0 && qty < minStock);

  // 재고 분포 게이지 segments
  const total = Math.max(Number(item.quantity), 1);
  const wh = Number(item.warehouse_qty);
  const depts = (item.locations ?? []).filter((l) => Number(l.quantity) > 0);
  const segments: { pct: number; color: string; label: string }[] = [];
  let used = 0;
  if (wh > 0) {
    const pct = Math.min(100, (wh / total) * 100);
    segments.push({ pct, color: "#3ac4b0", label: `창고 ${formatNumber(wh)}` });
    used += pct;
  }
  for (const loc of depts) {
    const pct = Math.min(100 - used, (Number(loc.quantity) / total) * 100);
    if (pct <= 0) break;
    segments.push({
      pct,
      color: employeeColor(loc.department),
      label: `${loc.department} ${formatNumber(loc.quantity)}`,
    });
    used += pct;
  }

  // 부서 배지
  const badges: { key: string; label: string; color: string; dim?: boolean }[] = [];
  if (Number(item.warehouse_qty) > 0) badges.push({ key: "창고", label: "창고", color: "#3dd4a0" });
  for (const l of item.locations.filter((l) => Number(l.quantity) > 0))
    badges.push({ key: l.department, label: l.department, color: employeeColor(l.department) });
  if (badges.length === 0) {
    const dept = item.department ?? erpCodeDept(item.erp_code);
    if (dept) badges.push({ key: dept, label: dept, color: employeeColor(dept), dim: true });
  }
  const visibleBadges = badges.slice(0, 2);
  const extraBadges = badges.length - 2;

  return (
    <tr
      onClick={() => onSelect(selected ? null : item)}
      className="group cursor-pointer transition-all hover:bg-[rgba(101,169,255,0.09)] hover:[box-shadow:inset_3px_0_0_rgba(101,169,255,0.45)]"
      style={{
        background: selected ? "rgba(101,169,255,.10)" : "transparent",
        boxShadow: selected ? `inset 3px 0 0 ${LEGACY_COLORS.blue}` : undefined,
      }}
    >
      <td
        className="border-b px-4 py-2.5 align-middle whitespace-nowrap"
        style={{ borderColor: LEGACY_COLORS.border }}
      >
        <span
          className="inline-flex w-fit rounded-full px-2.5 py-1 text-sm font-bold"
          style={{ color: stock.color, background: `color-mix(in srgb, ${stock.color} 12%, transparent)` }}
        >
          {stock.label}
        </span>
      </td>
      <td className="border-b px-4 py-2.5 align-middle" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="font-semibold">{item.item_name}</div>
        <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          {item.spec || "-"}
        </div>
        {Number(item.quantity) === 0 ? (
          <div
            className="mt-2 h-[5px] overflow-hidden rounded-full"
            style={{ background: "#ef4444" }}
            title="품절"
          />
        ) : (
          <div
            className="mt-2 flex h-[5px] overflow-hidden rounded-full"
            style={{ background: LEGACY_COLORS.s3 }}
            title={segments.map((s) => s.label).join(" / ")}
          >
            {segments.map((s, i) => (
              <div
                key={i}
                className="h-full shrink-0"
                style={{ width: `${s.pct}%`, background: s.color }}
              />
            ))}
          </div>
        )}
      </td>
      <td
        className="border-b px-4 py-2.5 align-middle whitespace-nowrap text-sm"
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}
      >
        {item.erp_code ?? "-"}
      </td>
      <td
        className="border-b px-4 py-2.5 align-middle whitespace-nowrap"
        style={{ borderColor: LEGACY_COLORS.border }}
      >
        <div className="flex items-center gap-1.5">
          {visibleBadges.map((b) => (
            <span
              key={b.key}
              className={`text-sm font-bold${b.dim ? " opacity-50" : ""}`}
              style={{ color: b.color }}
            >
              {b.label}
            </span>
          ))}
          {extraBadges > 0 && (
            <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              +{extraBadges}
            </span>
          )}
        </div>
      </td>
      <td
        className="border-b px-4 py-2.5 text-center align-middle whitespace-nowrap text-sm font-bold"
        style={{
          borderColor: LEGACY_COLORS.border,
          color: isCritical ? stock.color : LEGACY_COLORS.text,
        }}
      >
        {formatNumber(item.quantity)}
      </td>
      <td
        className="border-b px-4 py-2.5 text-center align-middle whitespace-nowrap text-sm font-bold"
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
      >
        {item.min_stock == null ? "-" : formatNumber(item.min_stock)}
      </td>
    </tr>
  );
}

export const InventoryItemRow = memo(InventoryItemRowImpl);
