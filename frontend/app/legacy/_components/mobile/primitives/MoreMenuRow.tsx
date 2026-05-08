"use client";

import clsx from "clsx";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";

export function MoreMenuRow({
  icon: Icon,
  label,
  description,
  badge,
  tone,
  onClick,
  disabled,
  className,
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  badge?: string | number | null;
  tone?: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const accent = tone ?? (LEGACY_COLORS.blue as string);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "flex w-full items-center gap-3 rounded-[18px] border px-4 py-3 text-left transition-[transform,opacity] active:scale-[0.98] disabled:opacity-40",
        className,
      )}
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]"
        style={{ background: `${accent}22`, color: accent }}
      >
        <Icon size={20} strokeWidth={1.85} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={clsx(TYPO.body, "font-black")} style={{ color: LEGACY_COLORS.text }}>
          {label}
        </div>
        {description ? (
          <div className={clsx(TYPO.caption, "truncate")} style={{ color: LEGACY_COLORS.muted2 }}>
            {description}
          </div>
        ) : null}
      </div>
      {badge != null && badge !== "" ? (
        <span
          className={clsx(TYPO.caption, "rounded-full px-2 py-[2px] font-black tabular-nums")}
          style={{ background: `${accent}26`, color: accent }}
        >
          {badge}
        </span>
      ) : null}
      <ChevronRight size={18} color={LEGACY_COLORS.muted} />
    </button>
  );
}
