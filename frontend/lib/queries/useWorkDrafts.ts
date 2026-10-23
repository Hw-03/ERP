"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { workDraftsApi } from "@/lib/api/work-drafts";
import { restoreOperatorSession } from "@/lib/auth/operator-session";
import type { WorkDraftFilters, WorkDraftSelection } from "@/lib/api/types/work-drafts";
import { queryKeys } from "./keys";
import { isDraftAuthError, WORK_DRAFT_GC_TIME } from "./workDraftCache";
import { STALE_TIME } from "./client";

/** 같은 로그인 안에서는 목록을 재사용하고 계정 경계에서만 폐기한다. */
export function useWorkDrafts(employeeId: string | null, filters: WorkDraftFilters, selected: WorkDraftSelection | null) {
  const client = useQueryClient();
  const previousEmployee = useRef(employeeId);
  useEffect(() => {
    if (previousEmployee.current && previousEmployee.current !== employeeId) {
      const queryKey = queryKeys.stockRequests.workDraftsAll(previousEmployee.current);
      void client.cancelQueries({ queryKey });
      client.removeQueries({ queryKey });
    }
    previousEmployee.current = employeeId;
  }, [client, employeeId]);

  const list = useQuery({
    queryKey: queryKeys.stockRequests.workDrafts(employeeId ?? "", filters),
    queryFn: ({ signal }) => workDraftsApi.list(employeeId!, filters, { signal }),
    enabled: Boolean(employeeId),
    retry: false, staleTime: STALE_TIME.VOLATILE, gcTime: WORK_DRAFT_GC_TIME, refetchOnMount: "always", refetchOnWindowFocus: true,
  });
  const detail = useQuery({
    queryKey: queryKeys.stockRequests.workDraftDetail(employeeId ?? "", selected),
    queryFn: ({ signal }) => workDraftsApi.getDetail(employeeId!, selected!, { signal }),
    enabled: Boolean(employeeId && selected),
    retry: false, staleTime: 0, gcTime: WORK_DRAFT_GC_TIME, refetchOnWindowFocus: true,
  });
  const authenticated = Boolean(employeeId && restoreOperatorSession(employeeId));
  return { list: { ...list, data: !authenticated || isDraftAuthError(list.error) ? undefined : list.data },
    detail: { ...detail, data: !authenticated || isDraftAuthError(detail.error) ? undefined : detail.data } };
}
