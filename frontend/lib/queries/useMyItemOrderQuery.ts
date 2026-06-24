"use client";

/**
 * 직원별 개인 품목 순서 React Query 훅.
 *
 * - useMyItemOrderQuery: 내 순서 조회. employeeId 없으면 비활성(빈 배열 폴백).
 * - usePutMyItemOrderMutation: 순서 저장 → invalidate.
 * - useResetMyItemOrderMutation: 순서 초기화(전체 삭제) → invalidate.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { itemsApi } from "@/lib/api/items";
import type { ItemOrderEntry } from "@/lib/api/items";
import { queryKeys } from "./keys";

export type { ItemOrderEntry };

export function useMyItemOrderQuery(employeeId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.myItemOrder.byEmployee(employeeId ?? ""),
    queryFn: () => itemsApi.getMyItemOrder(employeeId!),
    enabled: !!employeeId,
  });
}

export function usePutMyItemOrderMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { employee_id: string; items: ItemOrderEntry[] }) =>
      itemsApi.putMyItemOrder(payload),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: queryKeys.myItemOrder.byEmployee(variables.employee_id),
      });
    },
  });
}

export function useResetMyItemOrderMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (employeeId: string) => itemsApi.resetMyItemOrder(employeeId),
    onSuccess: (_data, employeeId) => {
      void qc.invalidateQueries({
        queryKey: queryKeys.myItemOrder.byEmployee(employeeId),
      });
    },
  });
}
