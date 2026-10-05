"use client";

/**
 * 결재 알림 React Query 훅.
 *
 * 서버 revision으로 동기화하며 30초 폴링과 화면 복귀 조회로 보완한다.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationsApi } from "@/lib/api/notifications";
import type { NotificationMarkReadPayload } from "@/lib/api/types";
import { STALE_TIME } from "./client";
import { queryKeys } from "./keys";

/** 내 알림 목록 + 안 읽음 수. 화면 복귀 시 fresh 캐시도 재확인한다. */
export function useNotificationsQuery(employeeId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.notifications.list(employeeId ?? ""),
    queryFn: () => notificationsApi.listNotifications(employeeId as string),
    enabled: !!employeeId,
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
      await qc.cancelQueries({ queryKey, exact: true });
      qc.setQueryData(queryKey, data);
      await qc.invalidateQueries({ queryKey, exact: true });
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
