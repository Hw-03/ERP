/**
 * 결재 알림 도메인 API — `@/lib/api/notifications`.
 */

import { fetcher, postJson, toApiUrl } from "../api-core";
import type { NotificationListResponse, NotificationMarkReadPayload } from "./types";

export const notificationsApi = {
  listNotifications: (employeeId: string) =>
    fetcher<NotificationListResponse>(
      toApiUrl(
        `/api/notifications?recipient_employee_id=${encodeURIComponent(employeeId)}`,
      ),
    ),

  unreadNotificationCount: (employeeId: string) =>
    fetcher<{ count: number }>(
      toApiUrl(
        `/api/notifications/unread-count?recipient_employee_id=${encodeURIComponent(employeeId)}`,
      ),
    ),

  markNotificationsRead: (payload: NotificationMarkReadPayload) =>
    postJson<NotificationListResponse>(
      toApiUrl("/api/notifications/mark-read"),
      payload,
    ),
};
