"use client";

import { memo, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { getStockState } from "@/lib/mes/inventory";
import { formatQty } from "@/lib/mes/format";
import { ImageLightbox } from "@/lib/ui/ImageLightbox";
import { useDeptColorLookup } from "../DepartmentsContext";

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
  imageFilename?: string;
  compact?: boolean;
};

function InventoryItemRowImpl({ item, selected, onSelect, imageFilename, compact }: Props) {
  const getDeptColor = useDeptColorLookup();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const minStock = getMinStock(item);
  const stock = getStockState(safeQty(item), minStock === 0 ? null : minStock);
  const qty = safeQty(item);
  const isCritical = qty <= 0 || (minStock > 0 && qty < minStock);

  const DEFECT_RED = "#ef4444";
  const total = Math.max(Number(item.quantity), 1);
  const wh = Number(item.warehouse_qty);
  const allLocs = (item.locations ?? []).filter((l) => Number(l.quantity) > 0);
  const prodLocs = allLocs.filter((l) => l.status !== "DEFECTIVE");
  const defectiveLocs = allLocs.filter((l) => l.status === "DEFECTIVE");
  const defectiveQty = defectiveLocs.reduce((sum, loc) => sum + Number(loc.quantity), 0);
  const segments: { pct: number; color: string; label: string }[] = [];
  let used = 0;
  if (wh > 0) {
    const pct = Math.min(100, (wh / total) * 100);
    segments.push({ pct, color: "#3ac4b0", label: `창고 ${formatQty(wh)}` });
    used += pct;
  }
  for (const loc of prodLocs) {
    const pct = Math.min(100 - used, (Number(loc.quantity) / total) * 100);
    if (pct <= 0) break;
    segments.push({
      pct,
      color: getDeptColor(loc.department),
      label: `${loc.department} ${formatQty(loc.quantity)}`,
    });
    used += pct;
  }
  for (const loc of defectiveLocs) {
    const pct = Math.min(100 - used, (Number(loc.quantity) / total) * 100);
    if (pct <= 0) break;
    segments.push({
      pct,
      color: DEFECT_RED,
      label: `${loc.department} [불량] ${formatQty(loc.quantity)}`,
    });
    used += pct;
  }

  const prodQtyByDept = new Map<string, number>();
  for (const loc of prodLocs) {
    prodQtyByDept.set(loc.department, (prodQtyByDept.get(loc.department) ?? 0) + Number(loc.quantity));
  }
  const stockChips: { key: string; label: string; quantity: number; color: string }[] = [
    { key: "warehouse", label: "창고", quantity: wh, color: "#3dd4a0" },
  ];
  for (const [dept, quantity] of Array.from(prodQtyByDept)) {
    stockChips.push({ key: `dept-${dept}`, label: dept, quantity, color: getDeptColor(dept) });
  }
  if (defectiveQty > 0) {
    stockChips.push({ key: "defective", label: "불량", quantity: defectiveQty, color: DEFECT_RED });
  }

  const StockIcon = stock.label === "품절" ? XCircle : stock.label === "부족" ? AlertTriangle : CheckCircle2;
  const handleSelect = () => onSelect(selected ? null : item);
  const stockBar = Number(item.quantity) === 0 ? (
    <div className="mt-[20px] h-[6px] overflow-hidden rounded-full" style={{ background: DEFECT_RED }} title="품절" />
  ) : (
    <div
      className="mt-[20px] flex h-[6px] overflow-hidden rounded-full"
      style={{ background: LEGACY_COLORS.s3 }}
      title={segments.map((s) => s.label).join(" / ")}
      role="img"
      aria-label={`재고 분포: ${segments.map((s) => `${s.label} ${s.pct.toFixed(0)}%`).join(", ")}`}
    >
      {segments.map((s, i) => (
        <div key={i} className="h-full shrink-0" style={{ width: `${s.pct}%`, background: s.color }} />
      ))}
    </div>
  );
  const rowProps = {
    onClick: handleSelect,
    onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleSelect();
      }
    },
    tabIndex: 0,
    role: "button",
    "aria-pressed": selected,
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    className: "group cursor-pointer transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]",
    style: {
      background: selected
        ? tint(LEGACY_COLORS.blue, hovered ? 18 : 10)
        : hovered
          ? LEGACY_COLORS.s4
          : undefined,
      boxShadow: selected
        ? `inset 3px 0 0 ${LEGACY_COLORS.blue}`
        : hovered
          ? `inset 3px 0 0 ${tint(LEGACY_COLORS.blue, 45)}`
          : undefined,
    },
  };

  return (
    <tr {...rowProps}>
      <td className="border-b px-4 py-5 align-middle whitespace-nowrap" style={{ borderColor: LEGACY_COLORS.border }}>
        <span
          className="inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold"
          style={{ color: stock.color, background: `color-mix(in srgb, ${stock.color} 12%, transparent)` }}
        >
          <StockIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {stock.label}
        </span>
      </td>
      {!compact && (
      <td className="hidden sm:table-cell border-b px-1 py-5 text-center align-middle" style={{ borderColor: LEGACY_COLORS.border, width: 60 }}>
        {imageFilename ? (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLightboxOpen(true); }}
              onKeyDown={(e) => e.stopPropagation()}
              aria-label={`${item.item_name} 이미지 확대`}
              className="inline-block cursor-zoom-in rounded border transition-transform hover:scale-105"
              style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
            >
              <Image src={`/images/items/${imageFilename}`} alt={item.item_name} width={48} height={48} unoptimized className="block rounded object-contain" />
            </button>
            <ImageLightbox open={lightboxOpen} src={`/images/items/${imageFilename}`} alt={item.item_name} onClose={() => setLightboxOpen(false)} />
          </>
        ) : null}
        </td>
      )}
        <td className="border-b px-4 py-5 align-middle" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="font-semibold">{item.item_name}</div>
          {stockBar}
        </td>
      {!compact && (
        <>
      <td className="hidden sm:table-cell border-b px-4 py-5 align-middle whitespace-nowrap text-sm" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}>
        {item.mes_code ?? "-"}
      </td>
      <td className="hidden sm:table-cell border-b px-4 py-5 align-middle" style={{ borderColor: LEGACY_COLORS.border }}>
        <div data-testid="inventory-dept-stock-summary" className="flex min-w-[190px] flex-wrap items-center justify-center gap-1.5">
          {stockChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold"
              style={{
                color: chip.color,
                background: `color-mix(in srgb, ${chip.color} 14%, transparent)`,
                borderColor: `color-mix(in srgb, ${chip.color} 35%, transparent)`,
              }}
            >
              {chip.label} {formatQty(chip.quantity)}
            </span>
          ))}
        </div>
      </td>
        </>
      )}
      <td
        className="border-b px-4 py-5 text-center align-middle whitespace-nowrap text-sm font-bold"
        data-testid="inventory-total-stock"
        style={{ borderColor: LEGACY_COLORS.border, color: isCritical ? stock.color : LEGACY_COLORS.text, width: compact ? 104 : undefined }}
      >
        {formatQty(qty)}
      </td>
      {!compact && (
      <td className="hidden sm:table-cell border-b px-4 py-5 text-center align-middle whitespace-nowrap text-sm font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
        {item.min_stock == null ? "-" : formatQty(item.min_stock)}
      </td>
      )}
    </tr>
  );
}

export const InventoryItemRow = memo(InventoryItemRowImpl);
