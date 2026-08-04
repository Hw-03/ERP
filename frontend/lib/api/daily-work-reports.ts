import { fetcher, putJson, toApiUrl } from "../api-core";
import type {
  DailyWorkActivity,
  DailyWorkReport,
  SaveDailyWorkReportPayload,
} from "./types/daily-work-reports";

export const dailyWorkReportsApi = {
  list: (workDate: string, opts?: { signal?: AbortSignal }) =>
    fetcher<DailyWorkReport[]>(
      toApiUrl(`/api/daily-work-reports?work_date=${encodeURIComponent(workDate)}`),
      opts?.signal,
    ),

  get: (employeeId: string, workDate: string, opts?: { signal?: AbortSignal }) =>
    fetcher<DailyWorkReport | null>(
      toApiUrl(`/api/daily-work-reports/${employeeId}/${workDate}`),
      opts?.signal,
    ),

  save: (employeeId: string, workDate: string, payload: SaveDailyWorkReportPayload) =>
    putJson<DailyWorkReport>(
      toApiUrl(`/api/daily-work-reports/${employeeId}/${workDate}`),
      { actor_employee_id: payload.actorEmployeeId, content: payload.content },
    ),

  activity: (employeeId: string, workDate: string, opts?: { signal?: AbortSignal }) =>
    fetcher<DailyWorkActivity>(
      toApiUrl(`/api/daily-work-reports/${employeeId}/${workDate}/activity`),
      opts?.signal,
    ),
};
