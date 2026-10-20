"use client";

import { memo, useState } from "react";
import Image from "next/image";
import { AlertTriangle, Archive, CheckCircle2, XCircle } from "lucide-react";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { getStockState } from "@/lib/mes/inventory";
import { formatQty } from "@/lib/mes/format";
import { ImageLightbox } from "@/lib/ui/ImageLightbox";
import { InventoryTableRow } from "./InventoryTable";
import { InventoryStockSummary } from "./InventoryStockSummary";
import { isDisusedInventoryItem } from "./inventoryFilter";

function safeAvailableQty(item: Item) {
  const n = Number(item.available_quantity);
  return isNaN(n) ? 0 : n;
}

function getMinStock(item: Item) {
  return item.min_stock == null ? 0 : Number(item.min_stock);
}

type Props = {
  item: Item;
  selected: boolean;
  detailOpen?: boolean;
  onSelect: (item: Item | null) => void;
  imageFilename?: string;
  compact?: boolean;
};

function InventoryItemRowImpl({ item, selected, detailOpen = true, onSelect, imageFilename, compact }: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const minStock = getMinStock(item);
  const qty = safeAvailableQty(item);
  const stock = getStockState(qty, minStock === 0 ? null : minStock);
  const statusBadge = isDisusedInventoryItem(item)
    ? { label: "불용", color: LEGACY_COLORS.muted2 }
    : stock;
  const isCritical = qty <= 0 || (minStock > 0 && qty < minStock);


  const StockIcon = statusBadge.label === "불용" ? Archive : stock.label === "품절" ? XCircle : stock.label === "부족" ? AlertTriangle : CheckCircle2;
  const handleSelect = () => onSelect(selected && detailOpen ? null : item);

  return (
    <InventoryTableRow selected={selected && detailOpen} onSelect={handleSelect} compact={compact}>
      <td className={compact ? "border-b px-2 py-3 text-center align-middle whitespace-nowrap" : "border-b px-4 py-5 text-center align-middle whitespace-nowrap"} style={{ borderColor: LEGACY_COLORS.border }}>
        <span
          className={compact ? "inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 text-xs font-medium" : "inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold"}
          style={{ color: statusBadge.color, background: `color-mix(in srgb, ${statusBadge.color} 12%, transparent)` }}
        >
          <StockIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {statusBadge.label}
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
        <td className={compact ? "border-b px-2 py-3 align-middle" : "border-b px-4 py-5 align-middle"} style={{ borderColor: LEGACY_COLORS.border }}>
          {compact ? (
            <div className="flex h-10 items-center">
              <div className="line-clamp-2 min-w-0 whitespace-normal break-keep [overflow-wrap:anywhere] text-[15px] font-bold leading-5">{item.item_name}</div>
            </div>
          ) : (
            <div className="font-semibold">{item.item_name}</div>
          )}
          <InventoryStockSummary item={item} compact={compact} mode="bar" />
        </td>
      {!compact && (
        <>
      <td className="hidden sm:table-cell border-b px-4 py-5 align-middle whitespace-nowrap text-center text-sm" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}>
        {item.mes_code ?? "-"}
      </td>
      <td className="hidden sm:table-cell border-b px-4 py-5 align-middle" style={{ borderColor: LEGACY_COLORS.border }}>
        <InventoryStockSummary item={item} />
      </td>
        </>
      )}
      <td
        className={compact ? "border-b px-2 py-3 text-center align-middle whitespace-nowrap text-sm font-semibold tabular-nums" : "border-b px-4 py-5 text-center align-middle whitespace-nowrap text-sm font-bold"}
        data-testid="inventory-total-stock"
        style={{ borderColor: LEGACY_COLORS.border, color: isCritical ? stock.color : LEGACY_COLORS.text, width: compact ? 72 : undefined }}
      >
        {formatQty(qty)}
      </td>
      {!compact && (
      <td className="hidden sm:table-cell border-b px-4 py-5 text-center align-middle whitespace-nowrap text-sm font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
        {item.min_stock == null ? "-" : formatQty(item.min_stock)}
      </td>
      )}
    </InventoryTableRow>
  );
}

export const InventoryItemRow = memo(InventoryItemRowImpl);
