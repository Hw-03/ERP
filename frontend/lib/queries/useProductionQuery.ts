"use client";

/**
 * Production domain React Query hooks.
 *
 * Transaction history hooks live in useTransactionsQuery.ts. This module keeps
 * production capacity, PF pin, and production receipt hooks only.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { productionApi } from "@/lib/api/production";
import { queryKeys } from "./keys";

export function useProductionCapacityQuery() {
  return useQuery({
    queryKey: queryKeys.production.capacity(),
    queryFn: () => productionApi.getProductionCapacity(),
  });
}

export function useProductionReceiptMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      payload: Parameters<typeof productionApi.productionReceipt>[0],
    ) => productionApi.productionReceipt(payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.production.all }),
  });
}
