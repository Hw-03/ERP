"use client";

import { memo } from "react";
import { LEGACY_COLORS, employeeColor } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import type { WeeklyGroupReport } from "@/lib/api/types/weekly";

interface Props {
  groups: WeeklyGroupReport[];
  selected: string;
  onSelect: (code: string) => void;
}

function WeeklyGroupCardsImpl({ groups, selected, onSelect }: Props) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
      {groups.map((g) => {
        const isActive = g.process_code === selected;
        const accentColor = employeeColor(g.dept_name);
        const isDecreasing = g.delta < 0;
        const tone = isDecreasing ? LEGACY_COLORS.red : accentColor;
        const deltaColor =
          g.delta > 0 ? LEGACY_COLORS.cyan
          : g.delta < 0 ? LEGACY_COLORS.red
          : LEGACY_COLORS.muted;

        return (
          <button
            key={g.process_code}
            type="button"
            onClick={() => onSelect(g.process_code)}
            className="overflow-hidden rounded-[18px] border text-left transition-colors hover:brightness-110"
            style={{
              padding: 0,
              display: "flex",
              background: isActive
                ? `color-mix(in srgb, ${tone} 8%, ${LEGACY_COLORS.s1})`
                : LEGACY_COLORS.s1,
              borderColor: isActive
                ? tone
                : isDecreasing
                ? `color-mix(in srgb, ${LEGACY_COLORS.red} 30%, ${LEGACY_COLORS.border})`
                : LEGACY_COLORS.border,
              boxShadow: isActive
                ? `0 0 0 1.5px color-mix(in srgb, ${tone} 20%, transparent), var(--c-card-shadow)`
                : "var(--c-card-shadow)",
            }}
          >
            {/* accent bar */}
            <div
              className="w-[3px] shrink-0 self-stretch rounded-l-[18px]"
              style={{
                background:
                  isActive || isDecreasing
                    ? tone
                    : `color-mix(in srgb, ${accentColor} 35%, transparent)`,
              }}
            />

            <div className="flex-1 px-3 py-3">
              {/* 부서명 + 코드 배지 */}
              <div className="flex items-center justify-between gap-1">
                <span
                  className="truncate text-[12px] font-black"
                  style={{ color: LEGACY_COLORS.text }}
                >
                  {g.dept_name}
                </span>
                <span
                  className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-black"
                  style={{
                    color: tone,
                    background: `color-mix(in srgb, ${tone} 12%, ${LEGACY_COLORS.s2})`,
                  }}
                >
                  {g.process_code}
                </span>
              </div>

              {/* 순변동 */}
              <div
                className="mt-2 text-[17px] font-black leading-tight"
                style={{ color: deltaColor }}
              >
                {g.delta > 0 ? `+${formatQty(g.delta)}` : g.delta < 0 ? formatQty(g.delta) : "±0"}
              </div>

              {/* 입고 / 출고 */}
              <div className="mt-1 text-[10px]" style={{ color: LEGACY_COLORS.muted }}>
                입 {formatQty(g.in_qty)} · 출 {formatQty(g.out_qty)}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export const WeeklyGroupCards = memo(WeeklyGroupCardsImpl);
