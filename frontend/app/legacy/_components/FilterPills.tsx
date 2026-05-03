"use client";

import { useState } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";

export function FilterPills({
  options,
  value,
  onChange,
  activeColor = LEGACY_COLORS.blue,
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
  activeColor?: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="mb-2 flex gap-[6px] overflow-x-auto pb-[2px]">
      {options.map((option) => {
        const active = option.value === value;
        const isHovered = hovered === option.value;
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            onMouseEnter={() => setHovered(option.value)}
            onMouseLeave={() => setHovered(null)}
            className="shrink-0 rounded-full border px-[11px] py-1 text-[10px] font-semibold transition-all duration-150 hover:scale-105"
            style={
              active
                ? {
                    background: activeColor,
                    borderColor: activeColor,
                    color: LEGACY_COLORS.white,
                  }
                : isHovered
                ? {
                    background: `color-mix(in srgb, ${activeColor} var(--pill-hover-mix, 14%), transparent)`,
                    borderColor: activeColor,
                    color: `color-mix(in srgb, ${activeColor}, #ffffff calc(var(--pill-inset-ring, 0) * 60%))`,
                    boxShadow: `inset 0 0 0 calc(var(--pill-inset-ring, 0) * 1px) ${activeColor}, 0 0 var(--pill-glow-blur, 0px) color-mix(in srgb, ${activeColor} var(--pill-glow-strength, 0%), transparent)`,
                    transform: "translateY(-1px)",
                  }
                : {
                    background: LEGACY_COLORS.s2,
                    borderColor: LEGACY_COLORS.border,
                    color: LEGACY_COLORS.muted2,
                  }
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
