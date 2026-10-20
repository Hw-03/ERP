"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { workReservationsApi } from "@/lib/api/work-reservations";
import type { InventoryWorkStatus } from "@/lib/api/types/work-reservations";
import { STALE_TIME } from "./client";
import { queryKeys } from "./keys";

/** 선택 상세에서만 공개 작업 현황을 조회한다. */
export function useInventoryWorkStatus(itemId: string, enabled = true): UseQueryResult<InventoryWorkStatus, Error> {
  return useQuery({
    queryKey: queryKeys.inventory.workStatus(itemId),
    queryFn: ({ signal }) => workReservationsApi.getItemWorkStatus(itemId, { signal }),
    enabled: enabled && Boolean(itemId),
    staleTime: STALE_TIME.VOLATILE,
    retry: false,
  });
}
