"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dailyWorkReportsApi } from "@/lib/api/daily-work-reports";
import type { SaveDailyWorkReportPayload } from "@/lib/api/types/daily-work-reports";
import { queryKeys } from "./keys";

export function useDailyWorkReportsQuery(workDate: string) {
  return useQuery({
    queryKey: queryKeys.dailyWorkReports.list(workDate),
    queryFn: ({ signal }) => dailyWorkReportsApi.list(workDate, { signal }),
    enabled: Boolean(workDate),
    placeholderData: [],
  });
}

export function useDailyWorkReportQuery(employeeId: string | null | undefined, workDate: string) {
  return useQuery({
    queryKey: queryKeys.dailyWorkReports.detail(employeeId ?? "", workDate),
    queryFn: ({ signal }) => dailyWorkReportsApi.get(employeeId!, workDate, { signal }),
    enabled: Boolean(employeeId && workDate),
  });
}

export function useDailyWorkActivityQuery(employeeId: string | null | undefined, workDate: string) {
  return useQuery({
    queryKey: queryKeys.dailyWorkReports.activity(employeeId ?? "", workDate),
    queryFn: ({ signal }) => dailyWorkReportsApi.activity(employeeId!, workDate, { signal }),
    enabled: Boolean(employeeId && workDate),
  });
}

export function useSaveDailyWorkReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, workDate, payload }: {
      employeeId: string;
      workDate: string;
      payload: SaveDailyWorkReportPayload;
    }) => dailyWorkReportsApi.save(employeeId, workDate, payload),
    onSuccess: (report) => {
      queryClient.setQueryData(
        queryKeys.dailyWorkReports.detail(report.employee_id, report.work_date),
        report,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.dailyWorkReports.list(report.work_date) });
    },
  });
}
