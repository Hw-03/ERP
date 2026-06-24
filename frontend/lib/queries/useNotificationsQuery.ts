"use client";

/**
 * 결재 알림 React Query 훅.
 *
 * 30초 폴링으로 안 읽은 알림을 가져온다(서버 알림 인프라는 폴링 기반).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationsApi } from "@/lib/api/notifications";
import type { NotificationMarkReadPayload } from "@/lib/api/types";
import { STALE_TIME } from "./client";
import { queryKeys } from "./keys";

/** 내 알림 목록 + 안 읽음 수. 30초 폴링. */
export function useNotificationsQuery(employeeId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.notifications.list(employeeId ?? ""),
    queryFn: () => notificationsApi.listNotifications(employeeId as string),
    enabled: !!employeeId,
    staleTime: STALE_TIME.VOLATILE,
    refetchInterval: 30_000,
  });
}

/** 알림 읽음 처리 (notification_ids 없으면 전체). */
export function useMarkNotificationsReadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: NotificationMarkReadPayload) =>
      notificationsApi.markNotificationsRead(payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all }),
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
