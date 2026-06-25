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

export function usePfPinsQuery() {
  return useQuery({
    queryKey: queryKeys.production.pfPins(),
    queryFn: () => productionApi.getPfPins(),
  });
}

export function useSetPfPinMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ modelSymbol, pfItemId }: { modelSymbol: string; pfItemId: string }) =>
      productionApi.setPfPin(modelSymbol, pfItemId),
    onSuccess: (_, { modelSymbol, pfItemId }) => {
      qc.setQueryData<Record<string, string>>(
        queryKeys.production.pfPins(),
        (old) => ({ ...(old ?? {}), [modelSymbol]: pfItemId }),
      );
    },
  });
}

export function useClearPfPinMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (modelSymbol: string) => productionApi.clearPfPin(modelSymbol),
    onSuccess: (_, modelSymbol) => {
      qc.setQueryData<Record<string, string>>(
        queryKeys.production.pfPins(),
        (old) => {
          const next = { ...(old ?? {}) };
          delete next[modelSymbol];
          return next;
        },
      );
    },
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
