"use client";

import { Activity, Clock3, RefreshCw, Search } from "lucide-react";
import { LEGACY_COLORS } from "./legacyUi";

export function DesktopTopbar({
  title,
  subtitle,
  search,
  onSearchChange,
  onRefresh,
  onToggleHistory,
  historyOpen,
  statusText,
}: {
  title: string;
  subtitle: string;
  search: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onToggleHistory: () => void;
  historyOpen: boolean;
  statusText: string;
}) {
  return (
    <header
      className="flex items-center gap-4 border-b px-8 py-5"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      <div className="min-w-0 flex-1">
        <div
          className="mb-1 text-[11px] font-bold uppercase tracking-[0.24em]"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          {subtitle}
        </div>
        <div className="text-[28px] font-black">{title}</div>
      </div>

      <div
        className="flex min-w-[320px] items-center gap-3 rounded-2xl border px-4 py-3"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <Search className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="품목명, 코드, 바코드, 비고 검색"
          className="w-full bg-transparent text-sm outline-none"
          style={{ color: LEGACY_COLORS.text }}
        />
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
