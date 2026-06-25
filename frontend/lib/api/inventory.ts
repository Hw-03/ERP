/**
 * Inventory domain API.
 *
 * Direct inventory write endpoints were removed from production use. This module
 * keeps read-only inventory summary/location calls; inventory changes go through
 * IO v2, defect, or department-adjustment flows.
 */

import { fetcher, toApiUrl } from "../api-core";
import type { InventoryLocationRow, InventorySummary } from "./types";

export const inventoryApi = {
  getInventorySummary: () => fetcher<InventorySummary>(toApiUrl("/api/inventory/summary")),

  getItemLocations: (itemId: string) =>
    fetcher<InventoryLocationRow[]>(toApiUrl("/api/inventory/locations/" + itemId)),
};
