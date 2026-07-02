"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { REQUEST_TYPE_LABEL } from "@/lib/io/glossary";
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
  getStoredBootId,
  setCurrentOperator,
  useCurrentOperator,
} from "../login/useCurrentOperator";
import { NotificationPanel } from "./NotificationPanel";

const TONE: Record<string, string> = {
  approval_request: LEGACY_COLORS.blue,
  approval_approved: LEGACY_COLORS.green,
  approval_rejected: LEGACY_COLORS.red,
  handover_arrived: LEGACY_COLORS.purple,
};

function humanizeBody(body: string): string {
  return body
    .split(" · ")
    .map((tok) => REQUEST_TYPE_LABEL[tok] ?? tok)
    .join(" · ");
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
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

function LoginNotificationDialog({
  items,
  unread,
  onClose,
  onMarkAll,
  onOpenPanel,
  onItemClick,
}: {
  items: AppNotification[];
  unread: number;
  onClose: () => void;
  onMarkAll: () => void;
  onOpenPanel: () => void;
  onItemClick: (n: AppNotification) => void;
}) {
  return (
    <div
      className="p-4"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 260,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,.45)",
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="로그인 알림"
        className="flex w-full max-w-[440px] flex-col rounded-[24px] border shadow-lg"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="min-w-0">
            <div className="text-lg font-black" style={{ color: LEGACY_COLORS.text }}>
              로그인 알림
            </div>
            <div className="mt-1 text-sm font-semibold" style={{ color: LEGACY_COLORS.muted }}>
              읽지 않은 알림 {unread}건이 있습니다.
            </div>
          </div>
          <button
            type="button"
            className="no-btn-inset flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ color: LEGACY_COLORS.muted }}
            aria-label="닫기"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[360px] overflow-y-auto px-3 py-3">
          {items.map((n) => {
            const tone = TONE[n.type] ?? LEGACY_COLORS.blue;
            return (
              <button
                key={n.notification_id}
                type="button"
                onClick={() => onItemClick(n)}
                className="no-btn-inset mb-2 flex w-full items-start rounded-[16px] px-3 py-3 text-left last:mb-0"
                style={{ background: tint(tone, 10) }}
              >
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: tone }} />
                <span className="ml-2 min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-black" style={{ color: tone }}>
                      {n.title}
                    </span>
                    <span className="ml-auto shrink-0 text-xs font-semibold" style={{ color: LEGACY_COLORS.muted }}>
                      {timeLabel(n.created_at)}
                    </span>
                  </span>
                  {n.body && (
                    <span className="mt-1 block text-xs font-semibold" style={{ color: LEGACY_COLORS.muted }}>
                      {humanizeBody(n.body)}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-2 border-t px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
          <button
            type="button"
            className="no-btn-inset rounded-[14px] border px-3 py-2.5 text-sm font-bold"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
            onClick={onClose}
          >
            닫기
          </button>
          <button
            type="button"
            className="no-btn-inset rounded-[14px] border px-3 py-2.5 text-sm font-bold"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.blue }}
            onClick={onMarkAll}
          >
            모두 읽음
          </button>
          <button
            type="button"
            className="no-btn-inset rounded-[14px] px-3 py-2.5 text-sm font-black text-white"
            style={{ background: LEGACY_COLORS.blue }}
            onClick={onOpenPanel}
          >
            알림 보기
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [loginPopupUpdating, setLoginPopupUpdating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const unread = data?.unread_count ?? 0;
  const unreadItems = useMemo(() => items.filter((n) => !n.is_read), [items]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (!employeeId || !operator?.loginPopupEnabled || !data || unread <= 0) return;
    if (!isVisibleInMountedTree(ref.current)) return;
    if (!consumeLoginNotificationPopupPending(employeeId)) return;
    setOpen(false);
    setLoginDialogOpen(true);
  }, [data, employeeId, operator?.loginPopupEnabled, unread]);

  if (!employeeId) return null;

  function handleItemClick(n: AppNotification) {
    if (employeeId && !n.is_read) {
      markRead.mutate({
        recipient_employee_id: employeeId,
        notification_ids: [n.notification_id],
      });
    }
    setOpen(false);
    setLoginDialogOpen(false);
    if (n.target_tab) onNavigate?.(n.target_tab, n.target_section ?? null);
  }

  function handleMarkAll() {
    if (employeeId) markRead.mutate({ recipient_employee_id: employeeId });
  }

  function handleLoginDialogMarkAll() {
    handleMarkAll();
    setLoginDialogOpen(false);
  }

  function handleDeleteItem(notificationId: string) {
    if (employeeId) deleteNotification.mutate({ notificationId, employeeId });
  }

  function handleDeleteRead() {
    if (employeeId) deleteRead.mutate(employeeId);
  }

  function handleOpenPanelFromLoginDialog() {
    setLoginDialogOpen(false);
    setOpen(true);
  }

  async function handleToggleLoginPopup() {
    if (!operator || !employeeId || loginPopupUpdating) return;
    const nextEnabled = !operator.loginPopupEnabled;
    setLoginPopupUpdating(true);
    try {
      await employeesApi.setLoginPopup(employeeId, nextEnabled);
      setCurrentOperator({ ...operator, loginPopupEnabled: nextEnabled }, getStoredBootId() ?? undefined);
    } catch {
      // 설정 저장 실패 시 기존 상태를 유지한다. 오류 오버레이로 화면을 막지 않는다.
    } finally {
      setLoginPopupUpdating(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        title="알림"
        aria-label={unread > 0 ? `알림 ${unread}건` : "알림"}
        className="relative flex h-9 w-9 items-center justify-center rounded-[14px] border"
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
          loginPopupEnabled={operator?.loginPopupEnabled ?? false}
          loginPopupUpdating={loginPopupUpdating}
          onToggleLoginPopup={() => void handleToggleLoginPopup()}
        />
      )}
      {loginDialogOpen && unreadItems.length > 0 && (
        <LoginNotificationDialog
          items={unreadItems}
          unread={unread}
          onClose={() => setLoginDialogOpen(false)}
          onMarkAll={handleLoginDialogMarkAll}
          onOpenPanel={handleOpenPanelFromLoginDialog}
          onItemClick={handleItemClick}
        />
      )}
    </div>
  );
}
