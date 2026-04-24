"use client";

import type { ElementType, ReactNode } from "react";
import { Clock3, RefreshCw } from "lucide-react";
import { LEGACY_COLORS } from "./legacyUi";
import { ThemeToggle } from "./ThemeToggle";

export type TopbarStatusSlot = {
  label: string;
  value: string | number;
  tone?: string;
};

export function DesktopTopbar({
  title,
  icon: Icon,
  onRefresh,
  statusText,
  statusSlots,
  actionSlot,
}: {
  title: string;
  icon?: ElementType;
  subtitle?: string;
  onRefresh: () => void;
  statusText: string;
  statusSlots?: TopbarStatusSlot[];
  actionSlot?: ReactNode;
}) {
  const useSlots = statusSlots && statusSlots.length > 0;

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
