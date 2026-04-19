"use client";

import { LEGACY_COLORS } from "./legacyUi";

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
  return (
    <div className="mb-2 flex gap-[6px] overflow-x-auto pb-[2px]">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className="shrink-0 rounded-xl border px-3 py-1.5 text-[10px] font-semibold transition-all duration-150 hover:-translate-y-0.5"
            style={
              active
                ? {
                    background: activeColor,
                    borderColor: activeColor,
                    color: "#fff",
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
