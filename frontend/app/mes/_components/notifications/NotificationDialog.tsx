"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Bell, BellRing, Check, CheckCheck, CircleX, Handshake, Package, Trash2, X } from "lucide-react";
import type { AppNotification } from "@/lib/api/types";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { useFocusTrap } from "@/lib/mes/useFocusTrap";
import { formatKstDateTime } from "@/lib/mes-format";
import { EmptyState } from "../common/EmptyState";
import { LoadFailureCard } from "../common/LoadFailureCard";
import { ReadLoading } from "../common/ReadState";
import { SkeletonBlock } from "../common/LoadingSkeleton";
import { getNotificationPresentation } from "./notificationPresentation";

export type NotificationFilter = "all" | "unread";

export interface NotificationDialogProps {
  items: AppNotification[];
  unread: number;
  unreadKnown?: boolean;
  filter: NotificationFilter;
  onFilterChange: (filter: NotificationFilter) => void;
  onClose: () => void;
  onItemClick: (notification: AppNotification) => void;
  onMarkAll: () => void;
  onDeleteItem: (id: string) => void;
  onDeleteRead: () => void;
  loginPopupEnabled: boolean;
  loginPopupUpdating?: boolean;
  onToggleLoginPopup: () => void;
  loading?: boolean;
  hasData?: boolean;
  error?: string | null;
  actionError?: string | null;
  onRetry?: () => void;
  actionsPending?: boolean;
}

const TONES: Record<string, string> = {
  approval_request: LEGACY_COLORS.blue,
  approval_approved: LEGACY_COLORS.green,
  approval_rejected: LEGACY_COLORS.red,
  handover_arrived: LEGACY_COLORS.purple,
};

const ICONS: Record<string, typeof Bell> = {
  approval_request: BellRing,
  approval_approved: Check,
  approval_rejected: CircleX,
  handover_arrived: Handshake,
};

/** Desktop notification history with a persistent header, scrollable list, and settings footer. */
export function NotificationDialog({
  items, unread, unreadKnown = true, filter, onFilterChange, onClose, onItemClick, onMarkAll,
  onDeleteItem, onDeleteRead, loginPopupEnabled,
  loginPopupUpdating = false, onToggleLoginPopup, loading = false, error = null,
  hasData = items.length > 0 || (!loading && !error),
  actionError = null, onRetry, actionsPending = false,
}: NotificationDialogProps) {
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const panelId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const allTabRef = useRef<HTMLButtonElement>(null);
  const unreadTabRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>(mounted, { initialFocusRef: closeRef });

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [mounted, onClose]);

  useEffect(() => {
    if (!mounted) return;
    const restoreDialogFocus = () => {
      if (dialogRef.current && !dialogRef.current.contains(document.activeElement)) closeRef.current?.focus();
    };
    restoreDialogFocus();
    document.addEventListener("focusin", restoreDialogFocus);
    return () => document.removeEventListener("focusin", restoreDialogFocus);
  }, [mounted, items, filter, actionsPending, dialogRef]);

  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>, current: NotificationFilter) => {
    let next: NotificationFilter | null = null;
    if (event.key === "Home") next = "all";
    else if (event.key === "End") next = "unread";
    else if (event.key === "ArrowRight") next = current === "all" ? "unread" : "all";
    else if (event.key === "ArrowLeft") next = current === "all" ? "unread" : "all";
    if (!next) return;
    event.preventDefault();
    (next === "all" ? allTabRef : unreadTabRef).current?.focus();
    onFilterChange(next);
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[260] flex items-center justify-center p-4 sm:p-6"
      style={{ background: "rgba(0,0,0,.45)" }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="flex w-full max-w-[640px] min-h-0 flex-col overflow-hidden rounded-[24px] border shadow-lg"
        style={{
          maxHeight: "min(720px, calc(100dvh - 48px))",
          background: "var(--c-popup-bg)", borderColor: LEGACY_COLORS.border,
          boxShadow: "var(--c-popup-shadow)",
        }}
      >
        <header className="flex shrink-0 items-center gap-3 border-b px-5 py-4" style={{ borderColor: LEGACY_COLORS.border }}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]" style={{ color: LEGACY_COLORS.blue, background: tint(LEGACY_COLORS.blue, 12) }} aria-hidden="true">
            <Bell className="h-5 w-5" />
          </span>
          <h2 id={titleId} className="min-w-0 flex-1 text-xl font-bold" style={{ color: LEGACY_COLORS.text }}>알림</h2>
          {unreadKnown && <p className="text-right text-sm" style={{ color: LEGACY_COLORS.muted2 }}>읽지 않은 알림 {unread}건</p>}
          <button ref={closeRef} type="button" onClick={onClose} aria-label="알림 닫기"
            className="no-btn-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2"
            style={{ color: LEGACY_COLORS.muted2 }}><X className="h-5 w-5" /></button>
        </header>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-5 py-2" style={{ borderColor: LEGACY_COLORS.border }}>
          <div role="tablist" aria-label="알림 필터" className="flex gap-1">
            {(["all", "unread"] as const).map((value) => (
              <button key={value} ref={value === "all" ? allTabRef : unreadTabRef} type="button" role="tab"
                aria-selected={filter === value} aria-controls={panelId} tabIndex={filter === value ? 0 : -1}
                onClick={() => onFilterChange(value)} onKeyDown={(event) => handleTabKey(event, value)}
                className="no-btn-inset min-h-11 rounded-[12px] px-4 text-sm font-bold transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2"
                style={{ color: filter === value ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2, background: filter === value ? tint(LEGACY_COLORS.blue, 12) : "transparent" }}>
                {value === "all" ? "전체" : "안 읽음"}
              </button>
            ))}
          </div>
          <button type="button" onClick={onMarkAll} disabled={unread === 0 || actionsPending}
            className="no-btn-inset flex min-h-11 items-center gap-1.5 rounded-[12px] px-3 text-sm font-bold transition active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2"
            style={{ color: LEGACY_COLORS.blue }}><CheckCheck className="h-4 w-4" />모두 읽음</button>
        </div>

        <div id={panelId} role="tabpanel" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5">
          {error && <div className="mb-3"><LoadFailureCard message={error} onRetry={onRetry} retryLabel="다시 시도" comfortable
            prefix={hasData ? "최신 정보를 불러오지 못했습니다. 기존 내용을 표시합니다" : "데이터를 불러오지 못했습니다"} /></div>}
          {actionError && <div role="alert" className="mb-3 rounded-[12px] px-4 py-3 text-sm font-bold break-words"
            style={{ color: LEGACY_COLORS.red, background: LEGACY_COLORS.errorBg }}>{actionError}</div>}
          {loading && !hasData ? <ReadLoading label="알림 목록 불러오는 중" skeleton={<div className="space-y-2">
            {[0, 1, 2].map((index) => <div key={index} className="flex gap-3 rounded-[14px] px-3 py-3">
              <SkeletonBlock className="h-10 w-10 shrink-0" />
              <div className="flex-1 space-y-2"><SkeletonBlock className="h-4 w-2/3" /><SkeletonBlock className="h-4 w-5/6" /></div>
            </div>)}
          </div>} /> : !hasData && error ? null : items.length === 0 ? (
            <EmptyState compact className="min-h-[200px]" title={filter === "unread" ? "읽지 않은 알림이 없습니다." : "알림이 없습니다."} description="" />
          ) : (
            <div className="space-y-2">
              {items.map((notification) => {
                const tone = TONES[notification.type] ?? LEGACY_COLORS.blue;
                const Icon = ICONS[notification.type] ?? Bell;
                const presentation = getNotificationPresentation(notification);
                const retired = notification.type === "approval_request" && notification.is_read && !notification.target_tab && !notification.target_section;
                return <div key={notification.notification_id} className="flex items-center rounded-[16px] border"
                  style={{ borderColor: LEGACY_COLORS.border, background: notification.is_read ? LEGACY_COLORS.s1 : tint(tone, 10) }}>
                  <button type="button" onClick={() => onItemClick(notification)} disabled={actionsPending || retired}
                    className="no-btn-inset flex min-w-0 flex-1 items-center gap-3 rounded-[16px] px-3 py-3 text-left transition active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2">
                    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]" style={{ color: tone, background: tint(tone, 14) }} aria-hidden="true">
                      <Icon className="h-5 w-5" />
                      {!notification.is_read && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full" style={{ background: tone }} />}
                    </span>
                    <span className="min-w-0 flex-1 break-words">
                      <span className="flex min-h-10 items-center gap-2">
                        <span className="min-w-0 text-xl font-bold" style={{ color: LEGACY_COLORS.text }}>{presentation.title}</span>
                        {presentation.status && <span className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold"
                          style={{ color: tone, background: tint(tone, 12) }}>{presentation.status}</span>}
                        <span className="ml-auto flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                          <span className="whitespace-nowrap text-sm" style={{ color: LEGACY_COLORS.muted2 }}>{formatKstDateTime(notification.created_at)}</span>
                          {presentation.requester && <span className="shrink-0 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>{presentation.requester}</span>}
                        </span>
                      </span>
                      {presentation.itemName && <span className="mt-1 flex min-w-0 items-center gap-1.5 text-sm">
                        <Package className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} aria-hidden="true" />
                        <span className="min-w-0 truncate font-bold" title={presentation.itemName} style={{ color: LEGACY_COLORS.text }}>{presentation.itemName}</span>
                        {presentation.additionalItemCount > 0 && <span className="shrink-0 font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>외 {presentation.additionalItemCount}품목</span>}
                      </span>}
                      {presentation.detail && <span className="mt-1 block text-sm" style={{ color: LEGACY_COLORS.muted2 }}>{presentation.detail}</span>}
                    </span>
                  </button>
                  <button type="button" onClick={() => onDeleteItem(notification.notification_id)} disabled={actionsPending}
                    aria-label="알림 삭제" className="no-btn-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] transition active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2"
                    style={{ color: LEGACY_COLORS.red }}><Trash2 className="h-4 w-4" /></button>
                </div>;
              })}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-5 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>로그인 팝업</span>
            <span className="text-xs font-bold" style={{ color: loginPopupEnabled ? LEGACY_COLORS.green : LEGACY_COLORS.muted2 }}>{loginPopupEnabled ? "켜짐" : "꺼짐"}</span>
            <button type="button" role="switch" aria-label="로그인 팝업" aria-checked={loginPopupEnabled}
              disabled={loginPopupUpdating} onClick={onToggleLoginPopup}
              className="no-btn-inset flex h-11 w-11 items-center justify-center rounded-[12px] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2">
              <span className="relative h-6 w-11 rounded-full transition-colors" style={{ background: loginPopupEnabled ? LEGACY_COLORS.green : LEGACY_COLORS.s3 }}>
                <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full shadow-sm transition-transform" style={{ background: LEGACY_COLORS.white, transform: loginPopupEnabled ? "translateX(20px)" : "translateX(0px)" }} />
              </span>
            </button>
          </div>
          <button type="button" onClick={onDeleteRead} disabled={actionsPending}
            className="no-btn-inset flex min-h-11 items-center gap-1.5 rounded-[12px] px-3 text-sm font-bold transition active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2"
            style={{ color: LEGACY_COLORS.red }}><Trash2 className="h-4 w-4" />읽은 알림 삭제</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
