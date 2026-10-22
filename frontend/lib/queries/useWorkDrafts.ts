"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { workDraftsApi } from "@/lib/api/work-drafts";
import { OPERATOR_LOGIN_CHANGED } from "@/lib/auth/login-recovery";
import { restoreOperatorSession } from "@/lib/auth/operator-session";
import type { WorkDraftFilters, WorkDraftSelection } from "@/lib/api/types/work-drafts";
import { queryKeys } from "./keys";

/** 전체 작업이 열린 동안만 조회하고 직원 전환·퇴장 시 이전 조회를 폐기한다. */
export function useWorkDrafts(employeeId: string | null, filters: WorkDraftFilters, selected: WorkDraftSelection | null) {
  const client = useQueryClient();
  useEffect(() => () => {
    if (!employeeId) return;
    const queryKey = queryKeys.stockRequests.workDraftsAll(employeeId);
    void client.cancelQueries({ queryKey });
    client.removeQueries({ queryKey });
  }, [client, employeeId]);
  useEffect(() => {
    if (!employeeId) return;
    const changed = () => {
      if (!restoreOperatorSession(employeeId)) return;
      const queryKey = queryKeys.stockRequests.workDraftsAll(employeeId);
      void client.cancelQueries({ queryKey }).then(() => client.invalidateQueries({ queryKey }));
    };
    window.addEventListener(OPERATOR_LOGIN_CHANGED, changed);
    return () => window.removeEventListener(OPERATOR_LOGIN_CHANGED, changed);
  }, [client, employeeId]);

  const list = useQuery({
    queryKey: queryKeys.stockRequests.workDrafts(employeeId ?? "", filters),
    queryFn: ({ signal }) => workDraftsApi.list(employeeId!, filters, { signal }),
    enabled: Boolean(employeeId),
    retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: true,
  });
  const detail = useQuery({
    queryKey: queryKeys.stockRequests.workDraftDetail(employeeId ?? "", selected),
    queryFn: ({ signal }) => workDraftsApi.getDetail(employeeId!, selected!, { signal }),
    enabled: Boolean(employeeId && selected),
    retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: true,
  });
  return { list, detail };
}
