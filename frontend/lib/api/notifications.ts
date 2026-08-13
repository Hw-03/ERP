/**
 * 결재 알림 도메인 API - `@/lib/api/notifications`.
 */

import { ApiError, parseError, toApiUrl } from "../api-core";
import { getAuditRequestHeaders } from "../activity-audit-context";
import { readCurrentEmployeeCodeForLog } from "../operator-log-context";
import type { NotificationListResponse, NotificationMarkReadPayload } from "./types";


async function requestWithActor<T>(
  url: string,
  employeeId: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-Actor-Employee-Id", employeeId);
  const employeeCode = readCurrentEmployeeCodeForLog();
  if (employeeCode) headers.set("X-MES-Employee-Code", employeeCode);
  for (const [name, value] of Object.entries(getAuditRequestHeaders())) {
    headers.set(name, value);
  }
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(url, { ...init, headers, credentials: "include" });
  if (!res.ok) throw new ApiError(await parseError(res), res.status);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const notificationsApi = {
  listNotifications: (employeeId: string) =>
    requestWithActor<NotificationListResponse>(
      toApiUrl(
        "/api/notifications?recipient_employee_id=" + encodeURIComponent(employeeId),
      ),
      employeeId,
    ),

  markNotificationsRead: (payload: NotificationMarkReadPayload) =>
    requestWithActor<NotificationListResponse>(
      toApiUrl("/api/notifications/mark-read"),
      payload.recipient_employee_id,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  deleteNotification: (notificationId: string, employeeId: string) =>
    requestWithActor<void>(
      toApiUrl(
        "/api/notifications/" + encodeURIComponent(notificationId) +
          "?recipient_employee_id=" + encodeURIComponent(employeeId),
      ),
      employeeId,
      { method: "DELETE" },
    ),

  deleteReadNotifications: (employeeId: string) =>
    requestWithActor<void>(
      toApiUrl(
        "/api/notifications/read?recipient_employee_id=" + encodeURIComponent(employeeId),
      ),
      employeeId,
      { method: "DELETE" },
    ),
};
