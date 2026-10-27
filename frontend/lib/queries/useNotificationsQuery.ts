"use client";

/**
 * 결재 알림 React Query 훅.
 *
 * 서버 revision으로 동기화하며 30초 폴링과 화면 복귀 조회로 보완한다.
 */

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationsApi } from "@/lib/api/notifications";
import type { NotificationListResponse, NotificationMarkReadPayload } from "@/lib/api/types";
import { STALE_TIME } from "./client";
import { queryKeys } from "./keys";

/** 닫힌 알림의 배지 조회. 로그인 판정은 마운트 뒤 새 응답을 기다린다. */
export function useNotificationUnreadCountQuery(
  employeeId: string | undefined,
  options: { enabled?: boolean } = {},
) {
  const query = useQuery({
    queryKey: queryKeys.notifications.unreadCount(employeeId ?? ""),
    queryFn: ({ signal }) => notificationsApi.getUnreadCount(employeeId as string, signal),
    enabled: !!employeeId && options.enabled !== false,
    staleTime: STALE_TIME.VOLATILE,
    refetchInterval: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
  const { isFetchedAfterMount, isFetching, refetch } = query;
  // 직원 전환은 observer 재마운트가 아니므로 fresh한 새 직원 캐시도 확인한다.
  useEffect(() => {
    if (employeeId && options.enabled !== false && !isFetchedAfterMount && !isFetching) {
      void refetch();
    }
  }, [employeeId, options.enabled, isFetchedAfterMount, isFetching, refetch]);
  return query;
}

/** 열린 필터의 상세 목록만 조회하고 성공한 서버 count를 배지 캐시에 반영한다. */
export function useNotificationsQuery(
  employeeId: string | undefined,
  options: { unreadOnly?: boolean; enabled?: boolean } = {},
) {
  const qc = useQueryClient();
  const unreadOnly = options.unreadOnly ?? false;
  return useQuery({
    queryKey: unreadOnly
      ? queryKeys.notifications.unread(employeeId ?? "")
      : queryKeys.notifications.list(employeeId ?? ""),
    queryFn: async ({ signal }) => {
      const data = await notificationsApi.listNotifications(employeeId as string, unreadOnly, signal);
      if (!signal.aborted) {
        qc.setQueryData(queryKeys.notifications.unreadCount(employeeId as string), { count: data.unread_count });
      }
      return data;
    },
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
      await Promise.all([
        qc.cancelQueries({ queryKey }),
        qc.cancelQueries({ queryKey: queryKeys.notifications.unreadCount(payload.recipient_employee_id) }),
      ]);
      qc.setQueryData(queryKeys.notifications.unreadCount(payload.recipient_employee_id), { count: data.unread_count });
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
    onSuccess: async (_data, { employeeId }) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: queryKeys.notifications.list(employeeId) }),
        qc.cancelQueries({ queryKey: queryKeys.notifications.unreadCount(employeeId) }),
      ]);
      await qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

/** 읽은 알림 전체 삭제. */
export function useDeleteReadNotificationsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (employeeId: string) =>
      notificationsApi.deleteReadNotifications(employeeId),
    onSuccess: async (_data, employeeId) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: queryKeys.notifications.list(employeeId) }),
        qc.cancelQueries({ queryKey: queryKeys.notifications.unreadCount(employeeId) }),
      ]);
      await qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}
