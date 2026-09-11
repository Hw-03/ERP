"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import type { DefectManagementCategory } from "@/lib/api/types/defects";

const OPTIONS: Array<{ value: DefectManagementCategory; label: string; color: string }> = [
  { value: "DEFECT", label: "불량 격리", color: LEGACY_COLORS.red },
  { value: "B_GRADE", label: "B급", color: LEGACY_COLORS.purple },
  { value: "OBSOLETE", label: "구형", color: LEGACY_COLORS.muted2 },
];

export function DefectManagementCategoryControl({
  value,
  onChange,
  fullWidth = false,
  excludedValue,
}: {
  value: DefectManagementCategory;
  onChange: (value: DefectManagementCategory) => void;
  fullWidth?: boolean;
  excludedValue?: DefectManagementCategory;
}) {
  const visibleOptions = excludedValue
    ? OPTIONS.filter((option) => option.value !== excludedValue)
    : OPTIONS;

  return (
    <div
      className={fullWidth
        ? `grid ${excludedValue ? "grid-cols-2" : "grid-cols-3"} gap-2`
        : "flex flex-wrap gap-1"}
      role="group"
      aria-label="보관 분류"
    >
      {visibleOptions.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={fullWidth
              ? "standard-hover min-h-11 w-full rounded-[12px] border px-3 py-2 text-sm font-black transition-colors active:scale-[0.98]"
              : "rounded-[8px] border px-2 py-1 text-xs font-black"}
            style={{
              background: selected ? tint(option.color, 14) : LEGACY_COLORS.s2,
              borderColor: selected ? option.color : LEGACY_COLORS.border,
              color: selected ? option.color : LEGACY_COLORS.muted2,
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
