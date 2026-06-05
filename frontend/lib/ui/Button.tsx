"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-[12px] gap-1.5 rounded-[10px]",
  md: "px-4 py-2 text-[13px] gap-1.5 rounded-[12px]",
  lg: "px-5 py-2.5 text-[15px] gap-2 rounded-[14px]",
};

const ICON_SIZE: Record<ButtonSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

function getVariantStyle(variant: ButtonVariant): React.CSSProperties {
  switch (variant) {
    case "primary":
      return { background: LEGACY_COLORS.blue, color: LEGACY_COLORS.white };
    case "secondary":
      return {
        background: LEGACY_COLORS.s2,
        borderColor: LEGACY_COLORS.border,
        color: LEGACY_COLORS.text,
      };
    case "ghost":
      return {
        background: "transparent",
        borderColor: LEGACY_COLORS.border,
        color: LEGACY_COLORS.muted2,
      };
    case "danger":
      return { background: LEGACY_COLORS.red, color: LEGACY_COLORS.white };
  }
}

/**
 * 공통 Button 컴포넌트 — `@/lib/ui/Button`.
 *
 * variants: primary / secondary / ghost / danger
 * sizes: sm / md / lg
 * - shadow-sm 로 박스(카드)와 시각 분리
 * - hover: brightness-110 / active: scale-[0.98]
 * - LEGACY_COLORS CSS 변수 → light/dark 자동 전환
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    iconLeft,
    iconRight,
    loading = false,
    disabled,
    children,
    className = "",
    style,
    ...rest
  },
  ref
) {
  const hasBorder = variant === "secondary" || variant === "ghost";
  const variantStyle = getVariantStyle(variant);
  const sizeClass = SIZE_CLASSES[size];
  const iconClass = ICON_SIZE[size];

  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type="button"
      disabled={isDisabled}
      className={[
        "inline-flex shrink-0 items-center justify-center font-bold transition-[filter,transform]",
        "shadow-sm",
        "hover:brightness-110 active:scale-[0.98]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        hasBorder ? "border" : "",
        sizeClass,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ ...variantStyle, ...style }}
      {...rest}
    >
      {loading ? (
        <span
          className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${iconClass}`}
        />
      ) : (
        iconLeft && <span className={`flex shrink-0 items-center ${iconClass}`}>{iconLeft}</span>
      )}
      {children}
      {!loading && iconRight && (
        <span className={`flex shrink-0 items-center ${iconClass}`}>{iconRight}</span>
      )}
    </button>
  );
});
