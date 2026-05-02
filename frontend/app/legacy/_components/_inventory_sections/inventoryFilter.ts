import type { Item } from "@/lib/api";
import type { KpiFilter } from "./InventoryKpiPanel";

/**
 * Inventory 필터/계산 helper.
 * Round-9 (R9-2) 분리. DesktopInventoryView 의 4개 helper 함수를 모음.
 */

export function getMinStock(item: Item): number {
  return item.min_stock == null ? 0 : Number(item.min_stock);
}

export function safeQty(item: Item): number {
  const n = Number(item.quantity);
  return isNaN(n) ? 0 : n;
}

export function matchesSearch(item: Item, keyword: string): boolean {
  if (!keyword) return true;
  const haystack = [
    item.erp_code,
    item.item_name,
    item.spec ?? "",
    item.location ?? "",
    item.supplier ?? "",
    item.legacy_model ?? "",
    item.barcode ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(keyword);
}

export function matchesKpi(item: Item, kpi: KpiFilter): boolean {
  const qty = safeQty(item);
  const min = getMinStock(item);
  if (kpi === "NORMAL") return qty > 0 && qty >= min;
  if (kpi === "LOW") return qty > 0 && qty < min;
  if (kpi === "ZERO") return qty <= 0;
  return true;
}
