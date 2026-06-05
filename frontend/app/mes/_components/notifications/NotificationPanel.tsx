"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import type { AppNotification } from "@/lib/api/types";

const TONE: Record<string, string> = {
  approval_request: LEGACY_COLORS.blue,
  approval_approved: LEGACY_COLORS.green,
  approval_rejected: LEGACY_COLORS.red,
  handover_arrived: LEGACY_COLORS.purple,
};

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

export function NotificationPanel({
  items,
  unread,
  onItemClick,
  onMarkAll,
}: {
  items: AppNotification[];
  unread: number;
  onItemClick: (n: AppNotification) => void;
  onMarkAll: () => void;
}) {
  return (
    <div
      className="absolute right-0 top-full z-50 mt-2 w-[320px] rounded-[20px] border p-2 shadow-lg"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <div className="text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
          알림
        </div>
        {unread > 0 && (
          <button
            onClick={onMarkAll}
            className="text-xs font-bold transition-opacity hover:opacity-80"
            style={{ color: LEGACY_COLORS.blue }}
          >
            모두 읽음
          </button>
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
              <button
                key={n.notification_id}
                onClick={() => onItemClick(n)}
                className="flex w-full flex-col gap-0.5 rounded-[14px] px-3 py-2 text-left transition-opacity hover:opacity-80"
                style={{ background: n.is_read ? "transparent" : tint(tone, 10) }}
              >
                <div className="flex items-center gap-2">
                  {!n.is_read && (
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tone }} />
                  )}
                  <span className="text-sm font-bold" style={{ color: tone }}>
                    {n.title}
                  </span>
                  <span className="ml-auto text-[10px]" style={{ color: LEGACY_COLORS.muted }}>
                    {timeLabel(n.created_at)}
                  </span>
                </div>
                {n.body && (
                  <span className="text-xs" style={{ color: LEGACY_COLORS.muted }}>
                    {n.body}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
