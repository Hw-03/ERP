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
      className="sticky top-0 z-20 flex items-center gap-3 border-b px-8 py-5 backdrop-blur-sm"
      style={{
        background: "color-mix(in srgb, var(--c-s1) 92%, transparent)",
        borderColor: "var(--c-border)",
        boxShadow: "var(--c-elev-1)",
      }}
    >
      <div className="min-w-0 flex-1">
        {subtitle ? (
          <div
            className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: "var(--c-muted2)" }}
          >
            {subtitle}
          </div>
        ) : null}
        {title ? (
          <div className="text-[26px] font-bold tracking-[-0.02em]">{title}</div>
        ) : null}
      </div>

      <div
        className="hidden items-center gap-2 rounded-2xl px-4 py-3 xl:flex"
        style={{
          background: "var(--c-s2)",
          border: "1px solid var(--c-border)",
          boxShadow: "var(--c-inner-hl)",
        }}
      >
        <Clock3 className="h-4 w-4" style={{ color: "var(--c-muted2)" }} />
        <div className="text-xs" style={{ color: "var(--c-muted2)" }}>
          {statusText}
        </div>
      </div>

      <button
        onClick={onToggleHistory}
        className="flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition-all duration-200 ease-out"
        style={{
          background: historyOpen ? "var(--c-accent-soft)" : "var(--c-s2)",
          borderColor: historyOpen ? "var(--c-accent-strong)" : "var(--c-border)",
          color: historyOpen ? "var(--c-blue)" : "var(--c-text)",
          boxShadow: historyOpen ? "var(--c-glow-blue)" : "var(--c-inner-hl)",
        }}
      >
        <Activity className="h-4 w-4" />
        입출고 이력
      </button>

      <ThemeToggle />

      <button
        onClick={onRefresh}
        className="flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white transition-all duration-200 ease-out hover:brightness-110"
        style={{
          background: "linear-gradient(135deg, var(--c-blue) 0%, color-mix(in srgb, var(--c-blue) 78%, #000 22%) 100%)",
          boxShadow: "var(--c-elev-2), var(--c-inner-hl)",
        }}
      >
        <RefreshCw className="h-4 w-4" />
        새로고침
      </button>
    </header>
  );
}
