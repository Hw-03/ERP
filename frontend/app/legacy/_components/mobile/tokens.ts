"use client";

export const TYPO = {
  overline: "text-[10px]",
  caption: "text-xs",
  body: "text-sm",
  title: "text-base",
  display: "text-xl",
  headline: "text-2xl",
} as const;

export const RADIUS = {
  xs: "rounded-[8px]",
  sm: "rounded-[14px]",
  md: "rounded-[20px]",
  lg: "rounded-[28px]",
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const ELEVATION = {
  none: "none",
  sticky: "0 8px 20px rgba(0,0,0,.28)",
  overlay: "0 18px 44px rgba(0,0,0,.48)",
} as const;

export const DURATION = {
  fast: 120,
  base: 180,
  slow: 260,
} as const;
