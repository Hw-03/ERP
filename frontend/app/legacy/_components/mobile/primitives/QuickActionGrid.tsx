"use client";

import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";

export interface QuickAction {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  tone?: string;
  onClick: () => void;
  disabled?: boolean;
}

export function QuickActionGrid({
  actions,
  columns = 2,
  className,
}: {
  actions: QuickAction[];
  columns?: 2 | 3;
  className?: string;
}) {
  return (
    <div
      className={clsx("grid gap-2", className)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {actions.map(({ id, label, description, icon: Icon, tone, onClick, disabled }) => {
        const accent = tone ?? (LEGACY_COLORS.blue as string);
        return (
          <button
            key={id}
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="flex flex-col items-start gap-2 rounded-[18px] border px-3 py-3 text-left transition-[transform,opacity] active:scale-[0.97] disabled:opacity-40"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-[12px]"
              style={{ background: `${accent}22`, color: accent }}
            >
              <Icon size={18} strokeWidth={1.85} />
            </div>
            <div className="min-w-0">
              <div
                className={clsx(TYPO.body, "font-black truncate")}
                style={{ color: LEGACY_COLORS.text }}
              >
                {label}
              </div>
              {description ? (
                <div
                  className={clsx(TYPO.caption, "truncate")}
                  style={{ color: LEGACY_COLORS.muted2 }}
                >
                  {description}
                </div>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
