"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { restoreOperatorSession } from "@/lib/auth/operator-session";
import { workDraftsApi } from "@/lib/api/work-drafts";
import { STALE_TIME } from "./client";
import { queryKeys } from "./keys";
import { isDraftAuthError, WORK_DRAFT_GC_TIME } from "./workDraftCache";

/** Header badges never load bundles or compute stock shortages. */
export function useWorkDraftCount(employeeId: string | null, refreshNonce = 0) {
  const query = useQuery({
    queryKey: [...queryKeys.stockRequests.workDraftsAll(employeeId ?? ""), "count"],
    queryFn: ({ signal }) => workDraftsApi.count(employeeId!, { signal }),
    enabled: Boolean(employeeId), staleTime: STALE_TIME.VOLATILE, gcTime: WORK_DRAFT_GC_TIME,
    retry: false, refetchOnMount: "always", refetchOnWindowFocus: true,
  });
  const previousRefresh = useRef(refreshNonce);
  useEffect(() => {
    if (previousRefresh.current !== refreshNonce && employeeId) void query.refetch({ cancelRefetch: false });
    previousRefresh.current = refreshNonce;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshNonce, employeeId]);
  return { ...query, data: isDraftAuthError(query.error) || !employeeId || !restoreOperatorSession(employeeId) ? undefined : query.data };
}
