import type { StocktakeTarget } from "@/lib/api/types/stocktake";

export type StocktakeKpi = "total" | "unconfirmed" | "confirmed" | "applied";
export const KPI_STATUS: Record<StocktakeKpi, string> = { total: "", unconfirmed: "UNCONFIRMED", confirmed: "CONFIRMED_WAITING", applied: "APPLIED" };

/** A partially finished item remains in progress until all its locations finish. */
export function stocktakeItemStatus(locations: ReadonlyArray<Pick<StocktakeTarget, "status">>): StocktakeTarget["status"] {
  const states = locations.map(location => location.status);
  if (!states.length) return "UNCOUNTED";
  if (states.every(status => status === "APPLIED")) return "APPLIED";
  if (states.every(status => status === "CONFIRMED" || status === "APPLIED")) return "CONFIRMED";
  if (states.includes("CLOSED_UNAPPLIED")) return "CLOSED_UNAPPLIED";
  if (states.some(status => ["DRAFT", "CONFIRMED", "APPLIED"].includes(status))) return "DRAFT";
  return "UNCOUNTED";
}
