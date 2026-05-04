"use client";

import { memo } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";

interface Props {
  active: boolean;
  label: string;
  onClick: () => void;
  tone?: string;
  size?: "sm" | "md";
}

function FilterChipImpl({ active, label, onClick, tone = LEGACY_COLORS.blue, size = "md" }: Props) {
  const px = size === "sm" ? "px-3 py-1" : "px-4 py-2";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border ${px} text-sm font-semibold transition-all hover:brightness-110`}
      style={{
        background: active ? `color-mix(in srgb, ${tone} 14%, transparent)` : LEGACY_COLORS.s2,
        borderColor: active ? tone : LEGACY_COLORS.border,
        color: active ? tone : LEGACY_COLORS.muted2,
      }}
    >
      {label}
    </button>
  );
}

export const FilterChip = memo(FilterChipImpl);
