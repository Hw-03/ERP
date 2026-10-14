import type { StocktakeTarget } from "@/lib/api/types/stocktake";

/** An item checkbox always selects every eligible owned location as one action. */
export function ownedWaitingLocations(row: StocktakeTarget, employeeId: string): StocktakeTarget[] {
  return (row.location_targets ?? [row]).filter(location => location.status === "CONFIRMED"
    && !!location.confirmation_revision_id && location.count?.owner_id === employeeId
    && location.waiting_eligible !== false);
}
