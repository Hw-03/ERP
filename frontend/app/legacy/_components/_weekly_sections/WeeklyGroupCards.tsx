"use client";

import { memo, useState } from "react";
import { LEGACY_COLORS, employeeColor } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import type { WeeklyGroupReport } from "@/lib/api/types/weekly";

interface Props {
  groups: WeeklyGroupReport[];
  selected: string;
  onSelect: (code: string) => void;
  cols?: 1 | 3;
}

function WeeklyGroupCardsImpl({ groups, selected, onSelect, cols = 3 }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className={`grid ${cols === 1 ? "grid-cols-1" : "grid-cols-3"} gap-3`}>
      {groups.map((g) => {
        const isActive = g.process_code === selected;
        const isHover = hovered === g.process_code;
        const isDecreasing = g.delta < 0;
        const accentColor = employeeColor(g.dept_name);
        const tone = isDecreasing ? LEGACY_COLORS.red : accentColor;
        const deltaColor =
          g.delta > 0 ? LEGACY_COLORS.cyan
          : g.delta < 0 ? LEGACY_COLORS.red
          : LEGACY_COLORS.muted2;

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
                ? tint(tone, 8, LEGACY_COLORS.s2)
                : isHover
                ? LEGACY_COLORS.s2
                : LEGACY_COLORS.s1,
              borderColor: isActive
                ? tone
                : isDecreasing
                ? tint(LEGACY_COLORS.red, 30, LEGACY_COLORS.border)
                : LEGACY_COLORS.border,
              boxShadow: isActive
                ? `0 0 0 1.5px ${tint(tone, 20)}, var(--c-card-shadow)`
                : undefined,
            }}
          >
            {/* Left accent bar */}
            <div
              className="absolute bottom-0 left-0 top-0 w-[3px]"
              style={{
                background: isActive || isDecreasing ? tone : tint(accentColor, 35),
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
                {g.delta !== 0 ? (
                  <div
                    className="text-[28px] font-black leading-none"
                    style={{ color: deltaColor }}
                  >
                    {g.delta > 0 ? `+${formatQty(g.delta)}` : formatQty(g.delta)}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-[16px] font-black leading-none"
                      style={{ color: LEGACY_COLORS.muted2 }}
                    >
                      ±0
                    </span>
                    <span
                      className="rounded-[5px] px-1.5 py-0.5 text-[10px] font-bold"
                      style={{
                        background: tint(LEGACY_COLORS.muted2, 12, LEGACY_COLORS.s2),
                        color: LEGACY_COLORS.muted2,
                      }}
                    >
                      변동 없음
                    </span>
                  </div>
                )}
              </div>
              {/* 우: 공정코드 배지 + 입고 + 출고 + 현재 */}
              <div className="flex flex-col items-end gap-1">
                <span
                  className="rounded-[6px] px-2 py-0.5 text-[11px] font-black"
                  style={{
                    background: tint(tone, 12, LEGACY_COLORS.s2),
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
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: LEGACY_COLORS.muted2 }}
                >
                  현재 {formatQty(g.current_qty)}
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
