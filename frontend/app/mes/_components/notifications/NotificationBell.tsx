"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { AppNotification } from "@/lib/api/types";
import {
  useDeleteNotificationMutation,
  useDeleteReadNotificationsMutation,
  useMarkNotificationsReadMutation,
  useNotificationsQuery,
} from "@/lib/queries/useNotificationsQuery";
import { useCurrentOperator } from "../login/useCurrentOperator";
import { NotificationPanel } from "./NotificationPanel";

/** 상단 헤더 종 아이콘 — 안 읽은 알림 배지 + 드롭다운 패널. 30초 폴링. */
export function NotificationBell({
  onNavigate,
}: {
  onNavigate?: (tab: string, section: string | null) => void;
}) {
  const operator = useCurrentOperator();
  const employeeId = operator?.employee_id;
  const { data } = useNotificationsQuery(employeeId);
  const markRead = useMarkNotificationsReadMutation();
  const deleteNotification = useDeleteNotificationMutation();
  const deleteRead = useDeleteReadNotificationsMutation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const items = data?.items ?? [];
  const unread = data?.unread_count ?? 0;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!employeeId) return null;

  function handleItemClick(n: AppNotification) {
    if (employeeId && !n.is_read) {
      markRead.mutate({
        recipient_employee_id: employeeId,
        notification_ids: [n.notification_id],
      });
    }
    setOpen(false);
    if (n.target_tab) onNavigate?.(n.target_tab, n.target_section ?? null);
  }

  function handleMarkAll() {
    if (employeeId) markRead.mutate({ recipient_employee_id: employeeId });
  }

  function handleDeleteItem(notificationId: string) {
    if (employeeId) deleteNotification.mutate({ notificationId, employeeId });
  }

  function handleDeleteRead() {
    if (employeeId) deleteRead.mutate(employeeId);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        title="알림"
        aria-label={unread > 0 ? `알림 ${unread}건` : "알림"}
        className="relative flex h-9 w-9 items-center justify-center rounded-[14px] border transition-opacity hover:opacity-90"
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
            style={{ background: LEGACY_COLORS.red }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <NotificationPanel
          items={items}
          unread={unread}
          onItemClick={handleItemClick}
          onMarkAll={handleMarkAll}
          onDeleteItem={handleDeleteItem}
          onDeleteRead={handleDeleteRead}
        />
      )}
    </div>
  );
}
