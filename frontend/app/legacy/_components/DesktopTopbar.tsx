"use client";

import { Activity, Clock3, RefreshCw } from "lucide-react";
import { LEGACY_COLORS } from "./legacyUi";

export function DesktopTopbar({
  title,
  subtitle,
  onRefresh,
  onToggleHistory,
  historyOpen,
  statusText,
}: {
  title: string;
  subtitle: string;
  onRefresh: () => void;
  onToggleHistory: () => void;
  historyOpen: boolean;
  statusText: string;
}) {
  return (
    <header
      className="sticky top-0 z-20 flex items-center gap-4 border-b px-8 py-5"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      <div className="min-w-0 flex-1">
        {subtitle ? (
          <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.24em]" style={{ color: LEGACY_COLORS.muted2 }}>
            {subtitle}
          </div>
        ) : null}
        {title ? <div className="text-[28px] font-black">{title}</div> : null}
      </div>

      <div className="hidden items-center gap-2 rounded-2xl px-4 py-3 xl:flex" style={{ background: LEGACY_COLORS.s2 }}>
        <Clock3 className="h-4 w-4" style={{ color: LEGACY_COLORS.muted2 }} />
        <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          {statusText}
        </div>
      </div>

      <button
        onClick={onToggleHistory}
        className="flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold"
        style={{
          background: historyOpen ? "rgba(79,142,247,.16)" : LEGACY_COLORS.s2,
          borderColor: historyOpen ? "rgba(79,142,247,.35)" : LEGACY_COLORS.border,
          color: historyOpen ? LEGACY_COLORS.blue : LEGACY_COLORS.text,
        }}
      >
        <Activity className="h-4 w-4" />
        입출고 이력
      </button>

      <button
        onClick={onRefresh}
        className="flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
        style={{ background: LEGACY_COLORS.blue, color: "#fff" }}
      >
        <RefreshCw className="h-4 w-4" />
        새로고침
      </button>
    </header>
  );
}
