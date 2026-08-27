"use client";

import { useQuery } from "@tanstack/react-query";
import { productionApi } from "@/lib/api/production";
import { STALE_TIME } from "./client";
import { queryKeys } from "./keys";

type OperationParams = Parameters<typeof productionApi.getInventoryOperations>[0];

export function useInventoryOperationsQuery(params?: OperationParams) {
  return useQuery({
    queryKey: queryKeys.transactions.operations(params),
    queryFn: () => productionApi.getInventoryOperations(params),
    staleTime: STALE_TIME.VOLATILE,
  });
}
