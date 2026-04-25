"use client";

import type { ElementType, ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { LEGACY_COLORS } from "./legacyUi";
import { ThemeToggle } from "./ThemeToggle";
import { StatusPill, inferToneFromStatus } from "./common/StatusPill";

export function DesktopTopbar({
  title,
  icon: Icon,
  onRefresh,
  actionSlot,
  stockWarnings,
  status,
}: {
  title: string;
  icon?: ElementType;
  onRefresh: () => void;
  actionSlot?: ReactNode;
  stockWarnings?: { low: number; zero: number };
  status?: string;
}) {
  return (
    <header className="pl-0 pr-4 pt-0">
      <div
        className="flex items-center gap-3 rounded-[28px] border px-5 py-4"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px]" style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.blue }}>
                <Icon className="h-5 w-5" />
              </div>
            )}
            <div className="text-[24px] font-black tracking-[-0.02em]">{title}</div>
          </div>
        </div>

        {stockWarnings && stockWarnings.zero > 0 && (
          <StatusPill tone="danger" label={`품절 ${stockWarnings.zero}`} showDot={false} maxWidth="none" />
        )}
        {stockWarnings && stockWarnings.low > 0 && (
          <StatusPill tone="warning" label={`부족 ${stockWarnings.low}`} showDot={false} maxWidth="none" />
        )}

        {status && <StatusPill tone={inferToneFromStatus(status)} label={status} title={status} />}

        {actionSlot}
        <ThemeToggle />

        <button
          onClick={onRefresh}
          className="flex items-center gap-2 rounded-[20px] px-4 py-2.5 text-base font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: LEGACY_COLORS.blue }}
        >
          <RefreshCw className="h-4 w-4" />
          새로고침
        </button>
      </div>
    </header>
  );
}
