"use client";

import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { getStockState } from "@/lib/mes/inventory";
import type { KpiCardData as KpiCard } from "../_inventory_sections/InventoryKpiPanel";
import { getMinStock, safeQty } from "../_inventory_sections/inventoryFilter";

/**
 * Round-13 (#20) 추출 — DesktopInventoryView 의 summary/kpiCards/badge derivation hook.
 */
export interface UseDesktopInventoryDerivationsResult {
  isFiltered: boolean;
  activeFilterCount: number;
  kpiCards: KpiCard[];
  headerBadge: ReactNode;
}

export function useDesktopInventoryDerivations({
  items,
  scopedItems,
  filteredItems,
  selectedDepts,
  selectedModels,
  deferredLocalSearch,
  displayItem,
  onSummaryChange,
}: {
  items: Item[];
  scopedItems: Item[];
  filteredItems: Item[];
  selectedDepts: string[];
  selectedModels: string[];
  deferredLocalSearch: string;
  displayItem: Item | null;
  onSummaryChange?: (s: { low: number; zero: number }) => void;
}): UseDesktopInventoryDerivationsResult {
  const summary = useMemo(() => {
    const totalQuantity = scopedItems.reduce((acc, item) => acc + safeQty(item), 0);
    const normalCount = scopedItems.filter((item) => safeQty(item) > 0 && safeQty(item) >= getMinStock(item)).length;
    const lowCount = scopedItems.filter((item) => safeQty(item) > 0 && safeQty(item) < getMinStock(item)).length;
    const zeroCount = scopedItems.filter((item) => safeQty(item) <= 0).length;
    return { totalCount: scopedItems.length, totalQuantity, normalCount, lowCount, zeroCount };
  }, [scopedItems]);

  useEffect(() => {
    onSummaryChange?.({ low: summary.lowCount, zero: summary.zeroCount });
  }, [summary.lowCount, summary.zeroCount, onSummaryChange]);

  const isFiltered = selectedDepts.length > 0 || selectedModels.length > 0 || deferredLocalSearch.length > 0;
  const activeFilterCount =
    selectedDepts.length + selectedModels.length + (deferredLocalSearch.length > 0 ? 1 : 0);

  const kpiCards: KpiCard[] = [
    {
      label: "전체",
      value: items.length,
      hint: isFiltered
        ? `${filteredItems.length}건 조회 중 · 클릭하면 전체 초기화`
        : "전체 품목",
      tone: LEGACY_COLORS.blue,
      key: "ALL",
    },
    { label: "정상", value: summary.normalCount, hint: "운영 가능", tone: LEGACY_COLORS.green, key: "NORMAL" },
    { label: "부족", value: summary.lowCount, hint: "안전재고 이하", tone: LEGACY_COLORS.yellow, key: "LOW" },
    { label: "품절", value: summary.zeroCount, hint: "즉시 조치 필요", tone: LEGACY_COLORS.red, key: "ZERO" },
  ];

  const headerBadge: ReactNode = displayItem
    ? (() => {
        const stock = getStockState(
          Number(displayItem.quantity),
          displayItem.min_stock == null ? null : Number(displayItem.min_stock),
        );
        return (
          <span
            className="inline-flex rounded-full px-3 py-1 text-sm font-bold"
            style={{ color: stock.color, background: `color-mix(in srgb, ${stock.color} 12%, transparent)` }}
          >
            {stock.label}
          </span>
        );
      })()
    : null;

  return { isFiltered, activeFilterCount, kpiCards, headerBadge };
}
