"use client";

import clsx from "clsx";
import { LEGACY_COLORS } from "../../legacyUi";
import { TYPO } from "../tokens";

export function KpiCard({
  label,
  value,
  color,
  active = false,
  onClick,
  className,
}: {
  label: string;
  value: number | string;
  color: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex flex-1 flex-col items-start gap-1 rounded-[20px] border px-4 py-3 text-left transition-[transform,border-color] active:scale-[0.98]",
        className,
      )}
      style={{
        background: active ? `${color}1a` : LEGACY_COLORS.s2,
        borderColor: active ? color : LEGACY_COLORS.border,
      }}
    >
      <div className={clsx(TYPO.caption, "font-semibold uppercase tracking-[1px]")} style={{ color: LEGACY_COLORS.muted2 }}>
        {label}
      </div>
      <div className={clsx(TYPO.display, "font-black tabular-nums")} style={{ color }}>
        {value}
      </div>
      <div className="h-[2px] w-full rounded-full" style={{ background: active ? color : `${color}40` }} />
    </button>
  );
}
