"use client";

import { Activity, Clock3, RefreshCw } from "lucide-react";
import { LEGACY_COLORS } from "./legacyUi";
import { ThemeToggle } from "./ThemeToggle";

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
      className="sticky top-0 z-20 flex items-center gap-4 border-b px-8 py-5 backdrop-blur-sm"
      style={{ background: LEGACY_COLORS.panel, borderColor: LEGACY_COLORS.border }}
    >
      <div className="min-w-0 flex-1">
        <div className="desktop-section-label mb-1">{subtitle || "Desktop Workspace"}</div>
        <div className="truncate text-[29px] font-black leading-none">{title || "운영 대시보드"}</div>
      </div>

      <div
        className="hidden max-w-[420px] items-center gap-3 rounded-2xl border px-4 py-3 xl:flex"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <Clock3 className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
        <div className="truncate text-xs" style={{ color: LEGACY_COLORS.textSoft }}>
          {statusText}
        </div>
      </div>

      <button
        onClick={onToggleHistory}
        className="flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition"
        style={{
          background: historyOpen ? LEGACY_COLORS.blueSoft : LEGACY_COLORS.s2,
          borderColor: historyOpen ? LEGACY_COLORS.borderStrong : LEGACY_COLORS.border,
          color: historyOpen ? LEGACY_COLORS.blue : LEGACY_COLORS.text,
        }}
      >
        <Activity className="h-4 w-4" />
        입출고 이력
      </button>

      <ThemeToggle />

      <button onClick={onRefresh} className="desktop-action-primary flex items-center gap-2">
        <RefreshCw className="h-4 w-4" />
        새로고침
      </button>
    </header>
  );
}
