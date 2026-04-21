"use client";

import { Clock3, RefreshCw } from "lucide-react";
import { LEGACY_COLORS } from "./legacyUi";
import { ThemeToggle } from "./ThemeToggle";

export function DesktopTopbar({
  title,
  onRefresh,
  statusText,
}: {
  title: string;
  subtitle?: string;
  onRefresh: () => void;
  statusText: string;
}) {
  return (
    <header className="pl-0 pr-4 pt-0">
      <div
        className="flex items-center gap-3 rounded-[28px] border px-5 py-4"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        <div className="min-w-0 flex-1">
          <div className="text-[24px] font-black tracking-[-0.02em]">{title}</div>
        </div>

        <div className="hidden min-w-[260px] items-center gap-3 rounded-[20px] border px-4 py-2.5 xl:flex" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: "rgba(101,169,255,.14)", color: LEGACY_COLORS.blue }}>
            <Clock3 className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
              {statusText}
            </div>
          </div>
        </div>

        <ThemeToggle />

        <button
          onClick={onRefresh}
          className="flex items-center gap-2 rounded-[20px] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: LEGACY_COLORS.blue }}
        >
          <RefreshCw className="h-4 w-4" />
          새로고침
        </button>
      </div>
    </header>
  );
}
