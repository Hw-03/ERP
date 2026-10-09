"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { AppNotification } from "@/lib/api/types";
import {
  useDeleteNotificationMutation,
  useDeleteReadNotificationsMutation,
  useMarkNotificationsReadMutation,
  useNotificationsQuery,
} from "@/lib/queries/useNotificationsQuery";
import { employeesApi } from "@/lib/api/employees";
import {
  consumeLoginNotificationPopupPending,
  updateCurrentOperatorPreferences,
  useCurrentOperator,
} from "../login/useCurrentOperator";
import { NotificationPanel } from "./NotificationPanel";
import { NotificationDialog, type NotificationFilter } from "./NotificationDialog";

export interface NotificationNavigationTarget {
  tab: string;
  section: string | null;
  relatedRequestId: string | null;
}

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

export function NotificationBell({
  onNavigate,
  loginDialogEnabled,
  mobilePresentation = false,
}: {
  onNavigate?: (target: NotificationNavigationTarget) => void;
  loginDialogEnabled: boolean;
  mobilePresentation?: boolean;
}) {
  const operator = useCurrentOperator();
  const employeeId = operator?.employee_id;
  const markRead = useMarkNotificationsReadMutation();
  const deleteNotification = useDeleteNotificationMutation();
  const deleteRead = useDeleteReadNotificationsMutation();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const [loginPopupUpdating, setLoginPopupUpdating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const allQuery = useNotificationsQuery(employeeId);
  const unreadQuery = useNotificationsQuery(employeeId, {
    unreadOnly: true,
    enabled: open && !mobilePresentation && filter === "unread",
  });
  const selectedQuery = !mobilePresentation && filter === "unread" ? unreadQuery : allQuery;
  const { data } = allQuery;

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const countData = unreadQuery.data && unreadQuery.dataUpdatedAt > allQuery.dataUpdatedAt
    ? unreadQuery.data : data;
  const unread = countData?.unread_count ?? 0;
  const actionsPending = markRead.isPending || deleteNotification.isPending || deleteRead.isPending;

  useEffect(() => {
    if (!open || !mobilePresentation) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, mobilePresentation]);

  useEffect(() => {
    if (!employeeId || !data) return;
    if (!isVisibleInMountedTree(ref.current)) return;
    if (!consumeLoginNotificationPopupPending(employeeId)) return;
    if (mobilePresentation || !loginDialogEnabled || !operator?.loginPopupEnabled || unread <= 0) return;
    setFilter("unread");
    setActionError(null);
    setOpen(true);
  }, [data, employeeId, loginDialogEnabled, mobilePresentation, operator?.loginPopupEnabled, unread]);

  if (!employeeId) return null;

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
      setActionError("알림을 읽음 처리하지 못했습니다. 다시 시도해 주세요.");
      return;
    }
    setOpen(false);
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
      setActionError("알림을 모두 읽음 처리하지 못했습니다. 다시 시도해 주세요.");
    }
  }

  async function handleDeleteItem(notificationId: string): Promise<void> {
    if (!employeeId || actionsPending) return;
    setActionError(null);
    try {
      await deleteNotification.mutateAsync({ notificationId, employeeId });
    } catch {
      setActionError("알림을 삭제하지 못했습니다. 다시 시도해 주세요.");
    }
  }

  async function handleDeleteRead(): Promise<void> {
    if (!employeeId || actionsPending) return;
    setActionError(null);
    try {
      await deleteRead.mutateAsync(employeeId);
    } catch {
      setActionError("읽은 알림을 삭제하지 못했습니다. 다시 시도해 주세요.");
    }
  }

  async function handleToggleLoginPopup() {
    if (!operator || !employeeId || loginPopupUpdating) return;
    const nextEnabled = !operator.loginPopupEnabled;
    setLoginPopupUpdating(true);
    setActionError(null);
    try {
      await employeesApi.setLoginPopup(employeeId, nextEnabled);
      updateCurrentOperatorPreferences({ loginPopupEnabled: nextEnabled });
    } catch {
      setActionError("로그인 팝업 설정을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setLoginPopupUpdating(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          if (!open) { setFilter("all"); setActionError(null); }
          setOpen((prev) => !prev);
        }}
        title="알림"
        aria-label={unread > 0 ? `알림 ${unread}건` : "알림"}
        className={`relative flex items-center justify-center rounded-[14px] border ${mobilePresentation ? "h-9 w-9" : "h-11 w-11"}`}
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
      >
        <Bell
          className="h-4 w-4"
          style={unread > 0 ? { animation: "statusFlash 1.2s ease-in-out infinite" } : undefined}
        />
        {unread > 0 && (
          <span
            key={unread}
            className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-black leading-none text-white"
            style={{ background: LEGACY_COLORS.redSolid }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && mobilePresentation && (
        <NotificationPanel
          mobilePresentation={mobilePresentation}
          loading={allQuery.isLoading && data === undefined}
          hasData={data !== undefined}
          error={allQuery.error ? "알림을 불러오지 못했습니다." : null}
          actionError={actionError}
          onRetry={() => void allQuery.refetch()}
          items={items}
          unread={unread}
          onItemClick={handleItemClick}
          onMarkAll={handleMarkAll}
          onDeleteItem={handleDeleteItem}
          onDeleteRead={handleDeleteRead}
          loginPopupEnabled={operator?.loginPopupEnabled ?? false}
          loginPopupUpdating={loginPopupUpdating}
          onToggleLoginPopup={() => void handleToggleLoginPopup()}
        />
      )}
      {open && !mobilePresentation && (
        <NotificationDialog
          items={selectedQuery.data?.items ?? []}
          unread={unread}
          unreadKnown={countData !== undefined}
          filter={filter}
          onFilterChange={setFilter}
          onClose={() => setOpen(false)}
          onMarkAll={handleMarkAll}
          onItemClick={handleItemClick}
          onDeleteItem={handleDeleteItem}
          onDeleteRead={handleDeleteRead}
          loginPopupEnabled={operator?.loginPopupEnabled ?? false}
          loginPopupUpdating={loginPopupUpdating}
          onToggleLoginPopup={() => void handleToggleLoginPopup()}
          loading={selectedQuery.isLoading && selectedQuery.data === undefined}
          hasData={selectedQuery.data !== undefined}
          error={selectedQuery.error ? "알림을 불러오지 못했습니다." : null}
          actionError={actionError}
          onRetry={() => void selectedQuery.refetch()}
          actionsPending={actionsPending}
        />
      )}
    </div>
  );
}
