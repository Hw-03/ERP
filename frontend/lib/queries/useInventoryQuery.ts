"use client";

/**
 * Inventory 도메인 React Query hook — W7-6.
 *
 * inventoryApi 메서드를 React Query로 래핑.
 * reference 패턴: useModelsQuery.ts
 *
 * 2 query + 5 mutation:
 *   useInventorySummaryQuery — 재고 현황 집계
 *   useItemLocationsQuery(itemId) — 품목별 위치 재고
 *   useReceiveInventoryMutation — 입고
 *   useAdjustInventoryMutation — 조정
 *   useTransferToProductionMutation — 창고→생산 이동
 *   useTransferToWarehouseMutation — 생산→창고 이동
 *   useMarkDefectiveMutation — 불량 처리
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api/inventory";
import { STALE_TIME } from "./client";
import { queryKeys } from "./keys";

export function useInventorySummaryQuery() {
  return useQuery({
    queryKey: queryKeys.inventory.summary(),
    queryFn: () => inventoryApi.getInventorySummary(),
    // 재고는 입출고·이동·불량으로 수시 변동 → 짧게 (R2-1).
    staleTime: STALE_TIME.VOLATILE,
  });
}

export function useItemLocationsQuery(itemId: string) {
  return useQuery({
    queryKey: queryKeys.inventory.locations(itemId),
    queryFn: () => inventoryApi.getItemLocations(itemId),
    enabled: Boolean(itemId),
    // 재고는 입출고·이동·불량으로 수시 변동 → 짧게 (R2-1).
    staleTime: STALE_TIME.VOLATILE,
  });
}

export function useReceiveInventoryMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof inventoryApi.receiveInventory>[0]) =>
      inventoryApi.receiveInventory(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.inventory.all }),
  });
}

export function useAdjustInventoryMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof inventoryApi.adjustInventory>[0]) =>
      inventoryApi.adjustInventory(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.inventory.all }),
  });
}

export function useTransferToProductionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof inventoryApi.transferToProduction>[0]) =>
      inventoryApi.transferToProduction(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.inventory.all }),
  });
}

export function useTransferToWarehouseMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof inventoryApi.transferToWarehouse>[0]) =>
      inventoryApi.transferToWarehouse(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.inventory.all }),
  });
}

export function useMarkDefectiveMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof inventoryApi.markDefective>[0]) =>
      inventoryApi.markDefective(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.inventory.all }),
  });
}
