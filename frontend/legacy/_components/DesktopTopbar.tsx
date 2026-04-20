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
      className="sticky top-0 z-20 flex items-center gap-4 border-b px-6 py-4"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold" style={{ color: LEGACY_COLORS.textSoft }}>
          {subtitle || "Desktop Workspace"}
        </div>
        <div className="mt-1 text-[18px] font-bold" style={{ color: LEGACY_COLORS.text }}>
          {title || "작업 화면"}
        </div>
      </div>

      <div
        className="hidden max-w-[320px] items-center gap-3 rounded-full border px-4 py-2.5 xl:flex"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <Clock3 className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
        <div className="truncate text-sm" style={{ color: LEGACY_COLORS.textSoft }}>
          {statusText}
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleHistory}
        className="flex items-center gap-2 px-2 py-2 text-sm font-semibold"
        style={{ color: LEGACY_COLORS.text }}
      >
        <Activity className="h-4 w-4" />
        입출고 이력
      </button>

      <ThemeToggle />

      <button
        type="button"
        onClick={onRefresh}
        className="flex items-center gap-2 px-2 py-2 text-sm font-semibold"
        style={{ color: LEGACY_COLORS.text }}
      >
        <RefreshCw className="h-4 w-4" />
        새로고침
      </button>
    </header>
  );
}
