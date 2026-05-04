"use client";

import { memo, useState } from "react";
import { LEGACY_COLORS, employeeColor } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import type { WeeklyGroupReport } from "@/lib/api/types/weekly";

interface Props {
  groups: WeeklyGroupReport[];
  selected: string;
  onSelect: (code: string) => void;
}

function WeeklyGroupCardsImpl({ groups, selected, onSelect }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-3 gap-3">
      {groups.map((g) => {
        const isActive = g.process_code === selected;
        const isHover = hovered === g.process_code;
        const isDecreasing = g.delta < 0;
        const accentColor = employeeColor(g.dept_name);
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
            onMouseEnter={() => setHovered(g.process_code)}
            onMouseLeave={() => setHovered(null)}
            className="relative overflow-hidden rounded-[16px] border text-left transition-colors hover:brightness-110"
            style={{
              background: isActive
                ? `color-mix(in srgb, ${tone} 8%, ${LEGACY_COLORS.s2})`
                : isHover
                ? LEGACY_COLORS.s3
                : LEGACY_COLORS.s2,
              borderColor: isActive
                ? tone
                : isDecreasing
                ? `color-mix(in srgb, ${LEGACY_COLORS.red} 30%, ${LEGACY_COLORS.border})`
                : LEGACY_COLORS.border,
              boxShadow: isActive
                ? `0 0 0 1.5px color-mix(in srgb, ${tone} 20%, transparent), var(--c-card-shadow)`
                : undefined,
            }}
          >
            {/* Left accent bar */}
            <div
              className="absolute bottom-0 left-0 top-0 w-[3px]"
              style={{
                background: isActive || isDecreasing ? tone : `color-mix(in srgb, ${accentColor} 35%, transparent)`,
              }}
            />
            {/* Content */}
            <div className="flex justify-between gap-3 py-3 pl-5 pr-4">
              {/* 좌: 부서명 + 순변동 */}
              <div className="flex flex-col gap-1">
                <div
                  className="text-[20px] font-black tracking-[-0.02em]"
                  style={{ color: LEGACY_COLORS.text }}
                >
                  {g.dept_name}
                </div>
                <div
                  className={`font-black leading-none ${g.delta === 0 ? "text-[14px]" : "text-[28px]"}`}
                  style={{ color: deltaColor }}
                >
                  {g.delta > 0
                    ? `+${formatQty(g.delta)}`
                    : g.delta < 0
                    ? formatQty(g.delta)
                    : "변동 없음"}
                </div>
              </div>
              {/* 우: 공정코드 배지 + 입고 + 출고 */}
              <div className="flex flex-col items-end gap-1">
                <span
                  className="rounded-[6px] px-2 py-0.5 text-[11px] font-black"
                  style={{
                    background: `color-mix(in srgb, ${tone} 12%, ${LEGACY_COLORS.s2})`,
                    color: tone,
                  }}
                >
                  {g.process_code}
                </span>
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: LEGACY_COLORS.muted }}
                >
                  입고 {formatQty(g.in_qty)}
                </span>
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: LEGACY_COLORS.muted }}
                >
                  출고 {formatQty(g.out_qty)}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export const WeeklyGroupCards = memo(WeeklyGroupCardsImpl);
