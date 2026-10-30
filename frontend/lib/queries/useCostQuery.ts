"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { costsApi } from "@/lib/api/costs";
import { restoreOperatorSession } from "@/lib/auth/operator-session";
import { useCurrentOperator } from "@/app/mes/_components/login/useCurrentOperator";
import type { CostActor, CostStandards, CostPurchaseInfoPatch } from "@/lib/api/types/cost";
import { queryKeys } from "./keys";
import { invalidateCostQueries } from "./costInvalidation";
import { useRealtimeRevision } from "./realtime";

/** Bind reads to the authenticated employee; old employee credentials cannot cross a switch. */
export function useCostActor(): CostActor | null {
  const operator = useCurrentOperator();
  return operator ? restoreOperatorSession(operator.employee_id) : null;
}

export function useCostQuery(itemId: string | null, actor: CostActor | null, simulationHourlyRate?: string) {
  return useQuery({
    queryKey: [...queryKeys.costs.item(actor?.employee_id ?? "", actor?.token ?? "", itemId ?? ""), ...(simulationHourlyRate === undefined ? [] : ["simulation", simulationHourlyRate])],
    queryFn: ({ signal }) => simulationHourlyRate === undefined ? costsApi.getItemCost(itemId!, actor!.token, signal) : costsApi.getItemCost(itemId!, actor!.token, signal, simulationHourlyRate),
    enabled: Boolean(itemId && actor),
    retry: false,
    staleTime: 0,
    placeholderData: (previous, query) => query?.queryKey[2] === actor?.employee_id && query?.queryKey[3] === actor?.token && query?.queryKey[4] === itemId ? previous : undefined,
  });
}

/** Mount only inside the authorized information tab; the server checks each read. */
export function useCostPurchaseInfoQuery(itemId: string, actor: CostActor) {
  return useQuery({
    queryKey: queryKeys.costs.information(actor.employee_id, actor.token, itemId),
    queryFn: ({ signal }) => costsApi.getPurchaseInfo(itemId, actor.token, signal),
    retry: false,
    staleTime: 0,
  });
}

/** One mutation stores both item and company criteria before refreshing consumers. */
export function useSaveCostPurchaseInfoMutation(itemId: string, actor: CostActor) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: CostPurchaseInfoPatch) => costsApi.updatePurchaseInfo(itemId, actor.token, values),
    onSuccess: async data => {
      qc.setQueryData(queryKeys.costs.information(actor.employee_id, actor.token, itemId), data);
      await Promise.all([
        invalidateCostQueries(qc),
        qc.invalidateQueries({ queryKey: queryKeys.items.all }),
        qc.invalidateQueries({ queryKey: queryKeys.inventory.all }),
      ]);
    },
  });
}

/** Fetch one summary request per loaded page; share standard/BOM invalidation. */
export function useCostSummaryQueries(pages: string[][], actor: CostActor | null, simulationHourlyRate?: string) {
  return useQueries({ queries: pages.map(itemIds => ({
    queryKey: [...queryKeys.costs.all, "summaries", actor?.employee_id, actor?.token, itemIds, ...(simulationHourlyRate === undefined ? [] : ["simulation", simulationHourlyRate])],
    queryFn: ({ signal }: { signal: AbortSignal }) => simulationHourlyRate === undefined ? costsApi.getItemSummaries(itemIds, actor!.token, signal) : costsApi.getItemSummaries(itemIds, actor!.token, signal, simulationHourlyRate),
    enabled: Boolean(actor && itemIds.length),
    retry: false,
    staleTime: 30_000,
  })) });
}

export function useSaveCostStandardsMutation(actor: CostActor | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, standards }: { itemId: string; standards: Partial<CostStandards> }) =>
      costsApi.updateItemStandards(itemId, actor!.token, standards),
    onSuccess: async () => {
      await Promise.all([invalidateCostQueries(qc), qc.invalidateQueries({ queryKey: queryKeys.items.all })]);
    },
  });
}

export function useSaveCompanyCostMutation(actor: CostActor | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hourlyRate: string | null) => costsApi.updateStandards(actor!.token, hourlyRate),
    onSuccess: () => invalidateCostQueries(qc),
  });
}

/** The legacy purchase form also uses the server permission, without requiring a query provider. */
export function useCostEditPermission(): boolean {
  const actor = useCostActor();
  const token = actor?.token;
  const revision = useRealtimeRevision();
  const [permission, setPermission] = useState<{ token: string; canEdit: boolean } | null>(null);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void costsApi.getStandards(token, controller.signal).then((value) => {
      if (!controller.signal.aborted) setPermission({ token, canEdit: value.can_edit });
    }).catch(() => { if (!controller.signal.aborted) setPermission({ token, canEdit: false }); });
    return () => controller.abort();
  }, [token, revision]);
  return Boolean(token && permission?.token === token && permission.canEdit);
}
