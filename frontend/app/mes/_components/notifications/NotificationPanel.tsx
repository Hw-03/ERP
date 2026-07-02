"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { REQUEST_TYPE_LABEL } from "@/lib/io/glossary";
import type { AppNotification } from "@/lib/api/types";

const TONE: Record<string, string> = {
  approval_request: LEGACY_COLORS.blue,
  approval_approved: LEGACY_COLORS.green,
  approval_rejected: LEGACY_COLORS.red,
  handover_arrived: LEGACY_COLORS.purple,
};

const NOTIFICATION_COPY = {
  title: "알림",
  loginPopup: "로그인 팝업",
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

function LoginPopupSwitch({
  enabled,
  disabled,
  onToggle,
}: {
  enabled: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={NOTIFICATION_COPY.loginPopup}
      aria-checked={enabled}
      disabled={disabled}
      onClick={onToggle}
      className="no-btn-inset relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150 disabled:cursor-wait disabled:opacity-70"
      style={{
        background: enabled ? LEGACY_COLORS.green : LEGACY_COLORS.s3,
        boxShadow: `inset 0 0 0 1px ${enabled ? "rgba(255,255,255,0.12)" : "rgba(76,97,130,0.12)"}`,
      }}
    >
      <span
        data-testid="login-popup-switch-knob"
        className="absolute top-0.5 h-5 w-5 rounded-full shadow-sm transition-transform duration-150"
        style={{
          left: "2px",
          transform: enabled ? "translateX(20px)" : "translateX(0px)",
          background: LEGACY_COLORS.white,
        }}
      />
    </button>
  );
}

export function NotificationPanel({
  items,
  unread,
  onItemClick,
  onMarkAll,
  onDeleteItem,
  onDeleteRead,
  loginPopupEnabled,
  loginPopupUpdating = false,
  onToggleLoginPopup,
}: {
  items: AppNotification[];
  unread: number;
  onItemClick: (n: AppNotification) => void;
  onMarkAll: () => void;
  onDeleteItem: (notificationId: string) => void;
  onDeleteRead: () => void;
  loginPopupEnabled?: boolean;
  loginPopupUpdating?: boolean;
  onToggleLoginPopup?: () => void;
}) {
  const hasRead = items.some((n) => n.is_read);

  return (
    <div
      className="absolute right-0 top-full z-50 mt-2 w-[320px] rounded-[20px] border p-2 shadow-lg"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      <div className="px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="shrink-0 text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
            {NOTIFICATION_COPY.title}
          </div>
          <div className="flex shrink-0 items-center justify-end gap-3">
            {hasRead && (
              <button
                onClick={onDeleteRead}
                className="no-btn-inset text-xs font-bold"
                style={{ color: LEGACY_COLORS.muted }}
              >
                읽은 알림 삭제
              </button>
            )}
            {unread > 0 && (
              <button
                onClick={onMarkAll}
                className="no-btn-inset text-xs font-bold"
                style={{ color: LEGACY_COLORS.blue }}
              >
                모두 읽음
              </button>
            )}
          </div>
        </div>
        {onToggleLoginPopup && loginPopupEnabled !== undefined && (
          <div className="mt-2 flex items-center justify-between gap-3 text-xs">
            <div className="min-w-0 text-xs font-bold" style={{ color: LEGACY_COLORS.muted }}>
              {NOTIFICATION_COPY.loginPopup}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className="text-xs font-black"
                style={{ color: loginPopupEnabled ? LEGACY_COLORS.green : LEGACY_COLORS.muted2 }}
              >
                {loginPopupEnabled ? "켜짐" : "꺼짐"}
              </span>
              <LoginPopupSwitch
                enabled={loginPopupEnabled}
                disabled={loginPopupUpdating}
                onToggle={onToggleLoginPopup}
              />
            </div>
          </div>
        )}
      </div>
      <div className="my-1 border-t" style={{ borderColor: LEGACY_COLORS.border }} />
      <div className="max-h-[360px] overflow-y-auto">
        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm" style={{ color: LEGACY_COLORS.muted }}>
            알림이 없습니다.
          </div>
        ) : (
          items.map((n) => {
            const tone = TONE[n.type] ?? LEGACY_COLORS.blue;
            return (
              <div
                key={n.notification_id}
                className="flex items-start rounded-[14px]"
                style={{ background: n.is_read ? "transparent" : tint(tone, 10) }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onItemClick(n)}
                  onKeyDown={(e) => e.key === "Enter" && onItemClick(n)}
                  className="flex flex-1 cursor-pointer flex-col gap-0.5 px-3 py-2 text-left"
                >
                  <div className="flex items-center gap-2">
                    {!n.is_read && (
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tone }} />
                    )}
                    <span className="text-sm font-bold" style={{ color: tone }}>
                      {n.title}
                    </span>
                    <span className="ml-auto shrink-0 text-xs" style={{ color: LEGACY_COLORS.muted }}>
                      {timeLabel(n.created_at)}
                    </span>
                  </div>
                  {n.body && (
                    <span className="text-xs" style={{ color: LEGACY_COLORS.muted }}>
                      {humanizeBody(n.body)}
                    </span>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteItem(n.notification_id);
                  }}
                  className="no-btn-inset shrink-0 px-2 py-2 text-xs opacity-30"
                  style={{ color: LEGACY_COLORS.muted }}
                  aria-label="알림 삭제"
                >
                  ✕
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
