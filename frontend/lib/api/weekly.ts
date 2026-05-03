import { fetcher, toApiUrl } from "../api-core";
import type { WeeklyReportResponse } from "./types/weekly";

export const weeklyApi = {
  getWeeklyReport: (params: { week_start: string; week_end: string }) => {
    const url = toApiUrl(
      `/api/inventory/weekly-report?week_start=${params.week_start}&week_end=${params.week_end}`
    );
    return fetcher<WeeklyReportResponse>(url);
  },
};
