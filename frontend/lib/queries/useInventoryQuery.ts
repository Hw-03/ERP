"use client";

/**
 * Inventory read-only React Query hooks.
 *
 * Inventory writes are handled by IO v2, defect, and department-adjustment
 * workflows. This file intentionally exposes summary/location reads only.
 */

import { useQuery } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api/inventory";
import { STALE_TIME } from "./client";
import { queryKeys } from "./keys";

export function useInventorySummaryQuery() {
  return useQuery({
    queryKey: queryKeys.inventory.summary(),
    queryFn: () => inventoryApi.getInventorySummary(),
    staleTime: STALE_TIME.VOLATILE,
  });
}

export function useItemLocationsQuery(itemId: string) {
  return useQuery({
    queryKey: queryKeys.inventory.locations(itemId),
    queryFn: () => inventoryApi.getItemLocations(itemId),
    enabled: Boolean(itemId),
    staleTime: STALE_TIME.VOLATILE,
  });
}
