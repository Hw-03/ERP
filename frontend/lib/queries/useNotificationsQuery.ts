"use client";

/**
 * 결재 알림 React Query 훅.
 *
 * 서버 revision으로 동기화하며 30초 폴링과 화면 복귀 조회로 보완한다.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationsApi } from "@/lib/api/notifications";
import type { NotificationListResponse, NotificationMarkReadPayload } from "@/lib/api/types";
import { STALE_TIME } from "./client";
import { queryKeys } from "./keys";

/** 내 알림 목록 + 안 읽음 수. 화면 복귀 시 fresh 캐시도 재확인한다. */
export function useNotificationsQuery(
  employeeId: string | undefined,
  options: { unreadOnly?: boolean; enabled?: boolean } = {},
) {
  const unreadOnly = options.unreadOnly ?? false;
  return useQuery({
    queryKey: unreadOnly
      ? queryKeys.notifications.unread(employeeId ?? "")
      : queryKeys.notifications.list(employeeId ?? ""),
    queryFn: () => unreadOnly
      ? notificationsApi.listNotifications(employeeId as string, true)
      : notificationsApi.listNotifications(employeeId as string),
    enabled: !!employeeId && options.enabled !== false,
    staleTime: STALE_TIME.VOLATILE,
    refetchInterval: 30_000,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
}

/** 알림 읽음 처리 (notification_ids 없으면 전체). */
export function useMarkNotificationsReadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: NotificationMarkReadPayload) =>
      notificationsApi.markNotificationsRead(payload),
    onSuccess: async (data, payload) => {
      const queryKey = queryKeys.notifications.list(payload.recipient_employee_id);
      // 저장 전에 시작한 조회가 성공 응답의 읽음 상태를 되돌리지 않게 한다.
      await qc.cancelQueries({ queryKey });
      qc.setQueryData(queryKey, data);
      // 전체 응답의 조회 제한 밖에 있는 미읽음 항목을 캐시에서 잃지 않는다.
      const markedIds = new Set(payload.notification_ids ?? []);
      qc.setQueryData<NotificationListResponse>(
        queryKeys.notifications.unread(payload.recipient_employee_id),
        (current) => current ? {
          ...current,
          unread_count: data.unread_count,
          items: markedIds.size > 0 && data.unread_count > 0
            ? current.items.filter((item) => !markedIds.has(item.notification_id))
            : [],
        } : undefined,
      );
      // 업무 화면 이동은 읽음 저장 성공을 기준으로 하고 재조회는 뒤에서 이어간다.
      void qc.invalidateQueries({ queryKey });
    },
  });
}

/** 알림 개별 삭제. */
export function useDeleteNotificationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ notificationId, employeeId }: { notificationId: string; employeeId: string }) =>
      notificationsApi.deleteNotification(notificationId, employeeId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });
}

/** 읽은 알림 전체 삭제. */
export function useDeleteReadNotificationsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (employeeId: string) =>
      notificationsApi.deleteReadNotifications(employeeId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });
}
