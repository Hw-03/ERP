"use client";

import { memo, useState } from "react";
import Image from "next/image";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { mesCodeDept } from "@/lib/mes/process";
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
};

function InventoryItemRowImpl({ item, selected, onSelect, imageFilename }: Props) {
  const getDeptColor = useDeptColorLookup();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const minStock = getMinStock(item);
  const stock = getStockState(safeQty(item), minStock === 0 ? null : minStock);
  const qty = safeQty(item);
  const isCritical = qty <= 0 || (minStock > 0 && qty < minStock);

  // 재고 분포 게이지 segments
  // PR#3: DEFECTIVE 구간(빨강)을 정상 구간 뒤에 추가. 순서: 창고 → 부서 정상 → 부서 불량
  const DEFECT_RED = "#ef4444";
  const total = Math.max(Number(item.quantity), 1);
  const wh = Number(item.warehouse_qty);
  const allLocs = (item.locations ?? []).filter((l) => Number(l.quantity) > 0);
  const prodLocs = allLocs.filter((l) => l.status !== "DEFECTIVE");
  const defectiveLocs = allLocs.filter((l) => l.status === "DEFECTIVE");
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

  // 부서 배지 (PRODUCTION 행만, DEFECTIVE는 별도 빨간 배지로 표시)
  const badges: { key: string; label: string; color: string }[] = [];
  if (Number(item.warehouse_qty) > 0) badges.push({ key: "창고", label: "창고", color: "#3dd4a0" });
  for (const l of (item.locations ?? []).filter((l) => Number(l.quantity) > 0 && l.status !== "DEFECTIVE"))
    badges.push({ key: l.department, label: l.department, color: getDeptColor(l.department) });
  // 불량 배지: 불량이 있는 부서에 빨간 [불량] 배지 추가
  const defectDepts = Array.from(new Set(
    (item.locations ?? []).filter((l) => l.status === "DEFECTIVE" && Number(l.quantity) > 0).map((l) => l.department)
  ));
  for (const dept of defectDepts)
    badges.push({ key: `${dept}-defect`, label: "[불량]", color: DEFECT_RED });
  if (badges.length === 0) {
    const dept = item.department ?? mesCodeDept(item.mes_code);
    if (dept) badges.push({ key: dept, label: dept, color: getDeptColor(dept) });
  }
  const visibleBadges = badges.slice(0, 2);
  const extraBadges = badges.length - 2;

  // 색상 외에도 아이콘으로 두 채널 신호 (WCAG 1.4.1)
  const StockIcon = stock.label === "품절" ? XCircle : stock.label === "부족" ? AlertTriangle : CheckCircle2;

  const handleSelect = () => onSelect(selected ? null : item);

  return (
    <tr
      onClick={handleSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSelect();
        }
      }}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      className="group cursor-pointer transition-all hover:bg-[rgba(101,169,255,0.09)] hover:[box-shadow:inset_3px_0_0_rgba(101,169,255,0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
      style={{
        background: selected ? "rgba(101,169,255,.10)" : "transparent",
        boxShadow: selected ? `inset 3px 0 0 ${LEGACY_COLORS.blue}` : undefined,
      }}
    >
      <td
        className="border-b px-4 py-5 align-middle whitespace-nowrap"
        style={{ borderColor: LEGACY_COLORS.border }}
      >
        <span
          className="inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold"
          style={{ color: stock.color, background: `color-mix(in srgb, ${stock.color} 12%, transparent)` }}
        >
          <StockIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {stock.label}
        </span>
      </td>
      <td
        className="hidden sm:table-cell border-b px-1 py-5 text-center align-middle"
        style={{ borderColor: LEGACY_COLORS.border, width: 60 }}
      >
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
              <Image
                src={`/images/items/${imageFilename}`}
                alt={item.item_name}
                width={48}
                height={48}
                unoptimized
                className="block rounded object-contain"
              />
            </button>
            <ImageLightbox
              open={lightboxOpen}
              src={`/images/items/${imageFilename}`}
              alt={item.item_name}
              onClose={() => setLightboxOpen(false)}
            />
          </>
        ) : null}
      </td>
      <td className="border-b px-4 py-5 align-middle" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="font-semibold">{item.item_name}</div>
        {Number(item.quantity) === 0 ? (
          <div
            className="mt-[20px] h-[6px] overflow-hidden rounded-full"
            style={{ background: "#ef4444" }}
            title="품절"
          />
        ) : (
          <div
            className="mt-[20px] flex h-[6px] overflow-hidden rounded-full"
            style={{ background: LEGACY_COLORS.s3 }}
            title={segments.map((s) => s.label).join(" / ")}
            role="img"
            aria-label={`재고 분포: ${segments.map((s) => `${s.label} ${s.pct.toFixed(0)}%`).join(", ")}`}
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
        className="hidden sm:table-cell border-b px-4 py-5 align-middle whitespace-nowrap text-sm"
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}
      >
        {item.mes_code ?? "-"}
      </td>
      <td
        className="hidden sm:table-cell border-b px-4 py-5 align-middle whitespace-nowrap"
        style={{ borderColor: LEGACY_COLORS.border }}
      >
        <div className="flex items-center justify-center gap-1.5">
          {visibleBadges.map((b) => (
            <span
              key={b.key}
              className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold"
              style={{
                color: b.color,
                background: `color-mix(in srgb, ${b.color} 14%, transparent)`,
                borderColor: `color-mix(in srgb, ${b.color} 35%, transparent)`,
              }}
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
        className="border-b px-4 py-5 text-center align-middle whitespace-nowrap text-sm font-bold"
        style={{
          borderColor: LEGACY_COLORS.border,
          color: isCritical ? stock.color : LEGACY_COLORS.text,
        }}
      >
        {formatQty(item.quantity)}{" "}
        <span className="text-xs font-normal" style={{ color: LEGACY_COLORS.muted2 }}>
          {item.unit ?? "개"}
        </span>
      </td>
      <td
        className="hidden sm:table-cell border-b px-4 py-5 text-center align-middle whitespace-nowrap text-sm font-bold"
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
      >
        {item.min_stock == null ? "-" : formatQty(item.min_stock)}
      </td>
    </tr>
  );
}

export const InventoryItemRow = memo(InventoryItemRowImpl);
