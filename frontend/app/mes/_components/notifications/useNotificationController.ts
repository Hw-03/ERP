"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AppNotification } from "@/lib/api/types";
import { useDeleteNotificationMutation, useDeleteReadNotificationsMutation, useMarkNotificationsReadMutation, useNotificationUnreadCountQuery, useNotificationsQuery } from "@/lib/queries/useNotificationsQuery";
import { queryKeys } from "@/lib/queries/keys";
import { employeesApi } from "@/lib/api/employees";
import { consumeLoginNotificationPopupPending, updateCurrentOperatorPreferences, type Operator } from "../login/useCurrentOperator";
import type { NotificationDialogProps, NotificationFilter } from "./NotificationDialog";
import type { NotificationNavigationTarget } from "./NotificationBell";

interface NotificationController {
  visibilityRef: RefObject<HTMLDivElement | null>;
  open: boolean;
  openDialog: () => void;
  unread: number;
  dialogProps: NotificationDialogProps;
}

/** Only the visible responsive shell may consume the one-time login marker. */
function isVisibleInMountedTree(element: HTMLElement | null): boolean {
  if (typeof window === "undefined" || !element || !document.body.contains(element)) return false;
  let current: HTMLElement | null = element;
  while (current) {
    const style = window.getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden") return false;
    current = current.parentElement;
  }
  return true;
}

/** Keep notification state alive even when the mobile More screen is unmounted. */
export function useNotificationController({ operator, onNavigate, loginDialogEnabled }: {
  operator: Operator | null;
  onNavigate?: (target: NotificationNavigationTarget) => void;
  loginDialogEnabled: boolean;
}): NotificationController {
  const employeeId = operator?.employee_id;
  const qc = useQueryClient();
  const markRead = useMarkNotificationsReadMutation();
  const deleteNotification = useDeleteNotificationMutation();
  const deleteRead = useDeleteReadNotificationsMutation();
  const [openEmployeeId, setOpenEmployeeId] = useState<string | undefined>();
  const open = !!employeeId && openEmployeeId === employeeId;
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const [loginPopupUpdating, setLoginPopupUpdating] = useState(false);
  const visibilityRef = useRef<HTMLDivElement>(null);
  const employeeRef = useRef(employeeId);
  employeeRef.current = employeeId;
  const countQuery = useNotificationUnreadCountQuery(employeeId, { enabled: !open });
  const allQuery = useNotificationsQuery(employeeId, { enabled: open && filter === "all" });
  const unreadQuery = useNotificationsQuery(employeeId, {
    unreadOnly: true,
    enabled: open && filter === "unread",
  });
  const selectedQuery = filter === "unread" ? unreadQuery : allQuery;
  const loginQuery = open ? selectedQuery : countQuery;
  const unread = countQuery.data?.count ?? 0;
  const actionsPending = markRead.isPending || deleteNotification.isPending || deleteRead.isPending;

  useEffect(() => {
    setOpenEmployeeId(undefined);
    setFilter("all");
    setActionError(null);
    setLoginPopupUpdating(false);
  }, [employeeId]);

  useEffect(() => {
    if (!employeeId || !loginQuery.isFetchedAfterMount || !loginQuery.isSuccess || loginQuery.isFetching) return;
    if (!isVisibleInMountedTree(visibilityRef.current)) return;
    if (!consumeLoginNotificationPopupPending(employeeId)) return;
    if (open || !loginDialogEnabled || !operator?.loginPopupEnabled || unread <= 0) return;
    void qc.invalidateQueries({ queryKey: queryKeys.notifications.unread(employeeId), exact: true, refetchType: "none" });
    setFilter("unread");
    setActionError(null);
    setOpenEmployeeId(employeeId);
  }, [loginQuery.dataUpdatedAt, loginQuery.isFetchedAfterMount, loginQuery.isFetching, loginQuery.isSuccess, employeeId, loginDialogEnabled, open, operator?.loginPopupEnabled, qc, unread]);

  const openDialog = useCallback((): void => {
    if (!employeeId) return;
    void qc.cancelQueries({ queryKey: queryKeys.notifications.unreadCount(employeeId) });
    void qc.invalidateQueries({ queryKey: queryKeys.notifications.list(employeeId), exact: true, refetchType: "none" });
    setFilter("all");
    setActionError(null);
    setOpenEmployeeId(employeeId);
  }, [employeeId, qc]);

  function closeDialog(): void {
    if (employeeId) {
      void qc.cancelQueries({ queryKey: queryKeys.notifications.list(employeeId) });
      void countQuery.refetch();
    }
    setOpenEmployeeId(undefined);
  }

  function changeFilter(nextFilter: NotificationFilter): void {
    if (employeeId && nextFilter !== filter) {
      void qc.cancelQueries({
        queryKey: filter === "unread" ? queryKeys.notifications.unread(employeeId) : queryKeys.notifications.list(employeeId),
        exact: true,
      });
      void qc.invalidateQueries({
        queryKey: nextFilter === "unread" ? queryKeys.notifications.unread(employeeId) : queryKeys.notifications.list(employeeId),
        exact: true,
        refetchType: "none",
      });
    }
    setFilter(nextFilter);
  }

  async function handleItemClick(n: AppNotification): Promise<void> {
    if (!employeeId || actionsPending) return;
    setActionError(null);
    try {
      if (!n.is_read) {
        await markRead.mutateAsync({
          recipient_employee_id: employeeId,
          notification_ids: [n.notification_id],
        });
      }
    } catch {
      if (employeeRef.current === employeeId) setActionError("알림을 읽음 처리하지 못했습니다. 다시 시도해 주세요.");
      return;
    }
    if (employeeRef.current !== employeeId) return;
    closeDialog();
    if (n.target_tab) {
      onNavigate?.({
        tab: n.target_tab,
        section: n.target_section ?? null,
        relatedRequestId: n.related_request_id ?? null,
      });
    }
  }

  async function handleMarkAll(): Promise<void> {
    if (!employeeId || actionsPending) return;
    setActionError(null);
    try {
      await markRead.mutateAsync({ recipient_employee_id: employeeId });
    } catch {
      if (employeeRef.current === employeeId) setActionError("알림을 모두 읽음 처리하지 못했습니다. 다시 시도해 주세요.");
    }
  }

  async function handleDeleteItem(notificationId: string): Promise<void> {
    if (!employeeId || actionsPending) return;
    setActionError(null);
    try {
      await deleteNotification.mutateAsync({ notificationId, employeeId });
    } catch {
      if (employeeRef.current === employeeId) setActionError("알림을 삭제하지 못했습니다. 다시 시도해 주세요.");
    }
  }

  async function handleDeleteRead(): Promise<void> {
    if (!employeeId || actionsPending) return;
    setActionError(null);
    try {
      await deleteRead.mutateAsync(employeeId);
    } catch {
      if (employeeRef.current === employeeId) setActionError("읽은 알림을 삭제하지 못했습니다. 다시 시도해 주세요.");
    }
  }

  async function handleToggleLoginPopup(): Promise<void> {
    if (!operator || !employeeId || loginPopupUpdating) return;
    const nextEnabled = !operator.loginPopupEnabled;
    setLoginPopupUpdating(true);
    setActionError(null);
    try {
      await employeesApi.setLoginPopup(employeeId, nextEnabled);
      if (employeeRef.current === employeeId) updateCurrentOperatorPreferences({ loginPopupEnabled: nextEnabled });
    } catch {
      if (employeeRef.current === employeeId) setActionError("로그인 팝업 설정을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      if (employeeRef.current === employeeId) setLoginPopupUpdating(false);
    }
  }

  return {
    visibilityRef, open: open && !!employeeId, openDialog, unread,
    dialogProps: {
      items: selectedQuery.data?.items ?? [], unread, filter, onFilterChange: changeFilter,
      onClose: closeDialog, onMarkAll: handleMarkAll, onItemClick: handleItemClick,
      onDeleteItem: handleDeleteItem, onDeleteRead: handleDeleteRead,
      loginPopupEnabled: operator?.loginPopupEnabled ?? false, loginPopupUpdating,
      onToggleLoginPopup: () => void handleToggleLoginPopup(),
      loading: selectedQuery.isLoading && selectedQuery.data === undefined,
      hasData: selectedQuery.data !== undefined,
      error: selectedQuery.error ? "알림을 불러오지 못했습니다." : null,
      actionError, onRetry: () => void selectedQuery.refetch(), actionsPending,
    },
  };
}
