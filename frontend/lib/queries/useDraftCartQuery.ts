"use client";

/**
 * Draft 장바구니 도메인 React Query hook.
 *
 * DraftCartPanel 은 재고요청 draft(stockRequestsApi) + IO draft(ioApi) 를 함께 보여주므로
 * 둘을 한 쿼리로 묶는다(기존 손수 Promise.all 동작 그대로). 삭제는 종류별 mutation 2개.
 * 키는 stockRequests.drafts 재사용 — 삭제/제출 시 stockRequests.all invalidate 로 함께 갱신됨.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import { ioApi } from "@/lib/api/io";
import { STALE_TIME } from "./client";
import { queryKeys } from "./keys";

/** 직원 draft 장바구니(재고요청 draft + IO draft 합본) */
export function useDraftCartQuery(employeeId: string | null) {
  return useQuery({
    queryKey: queryKeys.stockRequests.drafts(employeeId ?? ""),
    queryFn: async () => {
      const [stockDrafts, ioDrafts] = await Promise.all([
        stockRequestsApi.listStockRequestDrafts(employeeId!),
        ioApi.listDrafts(employeeId!),
      ]);
      return { stockDrafts, ioDrafts };
    },
    enabled: !!employeeId,
    // draft 는 다른 기기/세션에서 추가될 수 있어 짧게 (R2-1).
    staleTime: STALE_TIME.VOLATILE,
  });
}

/** 재고요청 draft 삭제 */
export function useDeleteStockRequestDraftMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, employeeId }: { requestId: string; employeeId: string }) =>
      stockRequestsApi.deleteStockRequestDraft(requestId, employeeId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.stockRequests.all }),
  });
}

/** IO draft 삭제 */
export function useDeleteIoDraftMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ batchId, employeeId }: { batchId: string; employeeId: string }) =>
      ioApi.deleteDraft(batchId, employeeId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.stockRequests.all }),
  });
}
