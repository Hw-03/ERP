"use client";

import { memo, useState } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import type { WeeklyGroupReport } from "@/lib/api/types/weekly";

interface Props {
  groups: WeeklyGroupReport[];
  selected: string;
  onSelect: (code: string) => void;
}

function getStateTone(g: WeeklyGroupReport): string {
  if (g.delta < 0) return LEGACY_COLORS.red;
  if (g.out_qty > 0) return LEGACY_COLORS.yellow;
  if (g.in_qty > 0) return LEGACY_COLORS.blue;
  return LEGACY_COLORS.muted2;
}

function WeeklyGroupCardsImpl({ groups, selected, onSelect }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-3 gap-3">
      {groups.map((g) => {
        const isActive = g.process_code === selected;
        const isHover = hovered === g.process_code;
        const isZero = g.in_qty === 0 && g.out_qty === 0 && g.delta === 0;
        const tone = getStateTone(g);

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
                ? `color-mix(in srgb, ${tone} 60%, ${LEGACY_COLORS.border})`
                : LEGACY_COLORS.border,
            }}
          >
            {/* Left accent bar */}
            <div
              className="absolute bottom-0 left-0 top-0 w-[3px]"
              style={{ background: tone, opacity: isZero ? 0.4 : 1 }}
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
                  className="text-[28px] font-black leading-none"
                  style={{ color: isZero ? LEGACY_COLORS.muted2 : tone }}
                >
                  {g.delta > 0
                    ? `+${formatQty(g.delta)}`
                    : g.delta < 0
                    ? formatQty(g.delta)
                    : "±0"}
                </div>
              </div>
              {/* 우: 공정코드 배지 + 입고 + 출고 */}
              <div className="flex flex-col items-end gap-1">
                <span
                  className="rounded-[6px] px-2 py-0.5 text-[11px] font-black"
                  style={{
                    background: `color-mix(in srgb, ${tone} 15%, ${LEGACY_COLORS.s2})`,
                    color: isZero ? LEGACY_COLORS.muted2 : tone,
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
