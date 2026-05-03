"use client";

import clsx from "clsx";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";

export function FilterChip({
  label,
  active,
  onClick,
  color,
  className,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
  className?: string;
}) {
  const activeColor = color ?? LEGACY_COLORS.blue;
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "shrink-0 rounded-full border px-3 py-[6px] font-semibold transition-all duration-150 active:scale-95",
        TYPO.caption,
        className,
      )}
      style={
        active
          ? { background: activeColor, borderColor: activeColor, color: LEGACY_COLORS.white }
          : { background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }
      }
    >
      {label}
    </button>
  );
}

export function FilterChipRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex gap-2 overflow-x-auto scrollbar-hide pb-[2px]", className)}>{children}</div>
  );
}
