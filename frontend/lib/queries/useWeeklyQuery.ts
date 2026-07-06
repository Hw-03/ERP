"use client";

import { useQuery } from "@tanstack/react-query";
import { weeklyApi } from "@/lib/api/weekly";
import { queryKeys } from "./keys";

export function useWeeklyReportQuery(params: { week_start: string; week_end: string }) {
  return useQuery({
    queryKey: queryKeys.weekly.report(params.week_start, params.week_end),
    queryFn: () => weeklyApi.getWeeklyReport(params),
  });
}
