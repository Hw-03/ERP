"use client";

import { memo } from "react";
import { Button } from "@/lib/ui/Button";
import { LEGACY_COLORS } from "@/lib/mes/color";

interface Props {
  active: boolean;
  label: string;
  onClick: () => void;
  tone?: string;
  size?: "sm" | "md";
  className?: string;
}

function FilterChipImpl({ active, label, onClick, tone = LEGACY_COLORS.blue, size = "md", className = "" }: Props) {
  const px = size === "sm" ? "px-3 py-1" : "px-4 py-2";
  return (
    <Button
      variant={active ? "ghost" : "secondary"}
      onClick={onClick}
      className={`whitespace-nowrap rounded-full ${px} text-sm ${className}`}
      style={{
        background: active ? `color-mix(in srgb, ${tone} 14%, transparent)` : LEGACY_COLORS.s2,
        borderColor: active ? tone : LEGACY_COLORS.border,
        color: active ? tone : LEGACY_COLORS.muted2,
      }}
    >
      {label}
    </Button>
  );
}

export const FilterChip = memo(FilterChipImpl);
