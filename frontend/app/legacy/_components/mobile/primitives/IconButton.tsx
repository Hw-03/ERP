"use client";

import { forwardRef } from "react";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { LEGACY_COLORS } from "../../legacyUi";

type Variant = "ghost" | "solid" | "outline";
type Size = "sm" | "md" | "lg";

const SIZE: Record<Size, { box: string; icon: number }> = {
  sm: { box: "h-8 w-8", icon: 16 },
  md: { box: "h-10 w-10", icon: 20 },
  lg: { box: "h-12 w-12", icon: 22 },
};

export const IconButton = forwardRef<
  HTMLButtonElement,
  {
    icon: LucideIcon;
    label: string;
    onClick?: () => void;
    variant?: Variant;
    size?: Size;
    color?: string;
    className?: string;
    disabled?: boolean;
    badge?: number;
    type?: "button" | "submit";
  }
>(function IconButton(
  { icon: Icon, label, onClick, variant = "ghost", size = "md", color, className, disabled, badge, type = "button" },
  ref,
) {
  const { box, icon } = SIZE[size];
  const tone = color ?? LEGACY_COLORS.text;

  const style =
    variant === "solid"
      ? { background: color ?? LEGACY_COLORS.s3, color: "#fff" }
      : variant === "outline"
      ? { background: "transparent", borderColor: LEGACY_COLORS.border, color: tone }
      : { background: "transparent", color: tone };

  return (
    <button
      ref={ref}
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={clsx(
        "relative inline-flex shrink-0 items-center justify-center rounded-[14px] transition-[transform,opacity] active:scale-95 disabled:opacity-40",
        variant === "outline" && "border",
        box,
        className,
      )}
      style={style}
    >
      <Icon size={icon} strokeWidth={1.75} />
      {badge != null && badge > 0 ? (
        <span
          className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold"
          style={{ background: LEGACY_COLORS.red, color: "#fff" }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </button>
  );
});
