"use client";

/**
 * Draft 장바구니 도메인 React Query hook.
 *
 * DraftCartPanel 은 재고요청 draft(stockRequestsApi) + IO draft(ioApi) 를 함께 보여주므로
 * 둘을 한 쿼리로 묶는다(기존 손수 Promise.all 동작 그대로). 삭제는 종류별 mutation 2개.
 * 키는 stockRequests.drafts 재사용 — 삭제/제출 시 stockRequests.all invalidate 로 함께 갱신됨.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import { ioApi } from "@/lib/api/io";
import { restoreOperatorSession } from "@/lib/auth/operator-session";
import { requestOperatorLogin } from "@/lib/auth/login-recovery";
import { ApiError } from "@/lib/api-core";
import { STALE_TIME } from "./client";
import { queryKeys } from "./keys";
import { invalidateWorkReservationQueries, shouldRefreshWorkReservations } from "./workReservationInvalidation";
import { isDraftAuthError, WORK_DRAFT_GC_TIME } from "./workDraftCache";

/** 직원 draft 장바구니(재고요청 draft + IO draft 합본) */
export function useDraftCartQuery(employeeId: string | null, options?: { enabled?: boolean }) {
  const query = useQuery({
    queryKey: queryKeys.stockRequests.drafts(employeeId ?? ""),
    queryFn: async ({ signal }) => {
      if (!restoreOperatorSession(employeeId!)) {
        requestOperatorLogin();
        throw new ApiError("작업자 인증을 다시 진행해 주세요.", 401, "OPERATOR_SESSION_INVALID");
      }
      const [stockDrafts, ioDrafts] = await Promise.all([
        stockRequestsApi.listStockRequestDrafts(employeeId!, { signal }),
        ioApi.listDrafts(employeeId!, { signal }),
      ]);
      return { stockDrafts, ioDrafts };
    },
    enabled: !!employeeId && options?.enabled !== false,
    // draft 는 다른 기기/세션에서 추가될 수 있어 짧게 (R2-1).
    staleTime: STALE_TIME.VOLATILE,
    gcTime: WORK_DRAFT_GC_TIME, refetchOnMount: "always", refetchOnWindowFocus: true,
  });
  const wasEnabled = useRef(options?.enabled !== false);
  useEffect(() => {
    const enabled = options?.enabled !== false;
    if (enabled && !wasEnabled.current && employeeId) void query.refetch({ cancelRefetch: false });
    wasEnabled.current = enabled;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options?.enabled, employeeId]);
  return { ...query, data: isDraftAuthError(query.error) || !employeeId || !restoreOperatorSession(employeeId) ? undefined : query.data };
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
    mutationFn: ({ batchId, employeeId, expectedRevision }: { batchId: string; employeeId: string; expectedRevision: number }) =>
      ioApi.deleteDraft(batchId, employeeId, expectedRevision),
    onSuccess: () => invalidateWorkReservationQueries(qc),
    onError: (error) => {
      if (shouldRefreshWorkReservations(error)) void invalidateWorkReservationQueries(qc);
    },
  });
}
