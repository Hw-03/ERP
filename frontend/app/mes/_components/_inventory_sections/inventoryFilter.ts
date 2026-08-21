import type { Item } from "@/lib/api";
import { matchesItemSearch } from "@/lib/itemSearch";
import { mesCodeDept } from "@/lib/mes/process";
import type { KpiFilter } from "./InventoryKpiPanel";

export type InventoryFilterLogic = "OR" | "AND";
export const DEFAULT_INVENTORY_FILTER_LOGIC: InventoryFilterLogic = "AND";
const DISUSED_MATERIAL_TYPE = "불용";

type InventoryCategoryFilters = {
  selectedDepts: string[];
  selectedSlots: Set<number>;
  showUnclassified: boolean;
  showDisused: boolean;
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

export function isDisusedInventoryItem(item: Item): boolean {
  return item.legacy_item_type === DISUSED_MATERIAL_TYPE;
}

function matchesDepartment(item: Item, department: string): boolean {
  return department === "창고"
    ? (item.warehouse_qty ?? 0) > 0
    : item.department === department ||
      mesCodeDept(item.mes_code) === department ||
      item.locations.some((location) => location.department === department);
}

function matchesSelectedGroup(matches: boolean[], logic: InventoryFilterLogic): boolean | null {
  if (matches.length === 0) return null;
  return logic === "AND" ? matches.every(Boolean) : matches.some(Boolean);
}

export function matchesInventoryCategoryFilters(item: Item, filters: InventoryCategoryFilters): boolean {
  const isDisused = isDisusedInventoryItem(item);
  if (isDisused && !filters.showDisused) return false;

  const stage = item.process_type_code?.slice(-1).toUpperCase() ?? "";
  const hasDefect = item.locations.some(
    (location) => location.status === "DEFECTIVE" && (location.quantity ?? 0) > 0,
  );
  const departmentMatch = matchesSelectedGroup(
    filters.selectedDepts.map((department) => matchesDepartment(item, department)),
    filters.logic,
  );
  const modelMatch = matchesSelectedGroup(
    [
      ...Array.from(filters.selectedSlots, (slot) => item.model_slots.includes(slot)),
      ...(filters.showUnclassified ? [item.model_slots.length === 0] : []),
    ],
    filters.logic,
  );
  const processMatch = matchesSelectedGroup(
    filters.selectedProcessSteps.map(
      (processStep) => processStep === stage || (processStep === "DEFECT" && hasDefect),
    ),
    filters.logic,
  );
  const disusedMatch = filters.showDisused ? isDisused : null;
  const activeMatches = [departmentMatch, modelMatch, processMatch, disusedMatch].filter(
    (match): match is boolean => match !== null,
  );

  if (activeMatches.length === 0) return true;
  return activeMatches.every(Boolean);
}
