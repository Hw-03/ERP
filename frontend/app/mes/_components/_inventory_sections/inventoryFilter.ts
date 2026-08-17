import type { Item } from "@/lib/api";
import { matchesItemSearch } from "@/lib/itemSearch";
import { mesCodeDept } from "@/lib/mes/process";
import type { KpiFilter } from "./InventoryKpiPanel";

export type InventoryFilterLogic = "OR" | "AND";
export const DEFAULT_INVENTORY_FILTER_LOGIC: InventoryFilterLogic = "AND";

type InventoryCategoryFilters = {
  selectedDepts: string[];
  selectedSlots: Set<number>;
  showUnclassified: boolean;
  selectedProcessSteps: string[];
  logic: InventoryFilterLogic;
};

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
  return matchesItemSearch(item, keyword);
}

export function matchesKpi(item: Item, kpi: KpiFilter): boolean {
  const qty = safeQty(item);
  const min = getMinStock(item);
  if (kpi === "NORMAL") return qty > 0 && qty >= min;
  if (kpi === "LOW") return qty > 0 && qty < min;
  if (kpi === "ZERO") return qty <= 0;
  return true;
}

function matchesDepartmentGroup(item: Item, selectedDepts: string[]): boolean | null {
  if (selectedDepts.length === 0) return null;

  return selectedDepts.some((department) =>
    department === "창고"
      ? (item.warehouse_qty ?? 0) > 0
      : item.department === department ||
        mesCodeDept(item.mes_code) === department ||
        item.locations.some((location) => location.department === department),
  );
}

export function matchesInventoryCategoryFilters(item: Item, filters: InventoryCategoryFilters): boolean {
  const departmentMatch = matchesDepartmentGroup(item, filters.selectedDepts);
  const modelMatch =
    filters.selectedSlots.size > 0 || filters.showUnclassified
      ? (filters.selectedSlots.size > 0 && item.model_slots.some((slot) => filters.selectedSlots.has(slot))) ||
        (filters.showUnclassified && item.model_slots.length === 0)
      : null;
  const stage = item.process_type_code?.slice(-1).toUpperCase() ?? "";
  const hasDefect = item.locations.some(
    (location) => location.status === "DEFECTIVE" && (location.quantity ?? 0) > 0,
  );
  const processMatch =
    filters.selectedProcessSteps.length > 0
      ? filters.selectedProcessSteps.some(
          (processStep) => processStep === stage || (processStep === "DEFECT" && hasDefect),
        )
      : null;
  const activeMatches = [departmentMatch, modelMatch, processMatch].filter(
    (match): match is boolean => match !== null,
  );

  if (activeMatches.length === 0) return true;
  return filters.logic === "OR" ? activeMatches.some(Boolean) : activeMatches.every(Boolean);
}
