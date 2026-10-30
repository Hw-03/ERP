import { requestJson } from "./stocktake";
import type { CompanyCostStandards, CostStandards, ItemCost, ItemCostSummary, CostPurchaseInfo, CostPurchaseInfoPatch } from "./types/cost";

export const costsApi = {
  getPurchaseInfo: (itemId: string, token: string, signal?: AbortSignal): Promise<CostPurchaseInfo> =>
    requestJson(`/api/costs/items/${encodeURIComponent(itemId)}/purchase-info`, token, { signal }),
  updatePurchaseInfo: (itemId: string, token: string, values: CostPurchaseInfoPatch): Promise<CostPurchaseInfo> =>
    requestJson(`/api/costs/items/${encodeURIComponent(itemId)}/purchase-info`, token,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) }),
  getItemSummaries: (itemIds: string[], token: string, signal?: AbortSignal, simulationHourlyRate?: string): Promise<ItemCostSummary[]> =>
    requestJson(`/api/costs/item-summaries${simulationHourlyRate === undefined ? "" : `?simulation_hourly_rate=${encodeURIComponent(simulationHourlyRate)}`}`, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_ids: itemIds }), signal }),
  getStandards: (token: string, signal?: AbortSignal): Promise<CompanyCostStandards> =>
    requestJson("/api/costs/standards", token, { signal }),
  updateStandards: (token: string, hourlyLaborRate: string | null): Promise<CompanyCostStandards> =>
    requestJson("/api/costs/standards", token, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hourly_labor_rate: hourlyLaborRate }) }),
  getItemCost: (itemId: string, token: string, signal?: AbortSignal, simulationHourlyRate?: string): Promise<ItemCost> =>
    requestJson(`/api/costs/items/${encodeURIComponent(itemId)}${simulationHourlyRate === undefined ? "" : `?simulation_hourly_rate=${encodeURIComponent(simulationHourlyRate)}`}`, token, { signal }),
  updateItemStandards: (itemId: string, token: string, standards: Partial<CostStandards>): Promise<ItemCost> =>
    requestJson(`/api/costs/items/${encodeURIComponent(itemId)}/standards`, token,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(standards) }),
};
