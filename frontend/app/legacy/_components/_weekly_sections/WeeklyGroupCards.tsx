"use client";

import { memo } from "react";
import { LEGACY_COLORS, employeeColor } from "@/lib/mes/color";
import type { WeeklyGroupReport } from "@/lib/api/types/weekly";

function fmt(n: number) {
  return Number(n).toLocaleString("ko-KR");
}

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
        const delta = Number(g.delta);
        const accentColor = employeeColor(g.dept_name);
        const isDecreasing = delta < 0;
        const isIncreasing = delta > 0;

        const statusBadge = isIncreasing
          ? { text: "증가", color: LEGACY_COLORS.green }
          : isDecreasing
          ? { text: "감소 확인", color: LEGACY_COLORS.red }
          : { text: "변화 없음", color: LEGACY_COLORS.muted };

        const cardBg = isDecreasing
          ? `color-mix(in srgb, ${LEGACY_COLORS.red} 5%, ${LEGACY_COLORS.s1})`
          : isActive
          ? LEGACY_COLORS.s2
          : LEGACY_COLORS.s1;

        const borderColor = isActive
          ? `color-mix(in srgb, ${accentColor} 55%, ${LEGACY_COLORS.border})`
          : isDecreasing
          ? `color-mix(in srgb, ${LEGACY_COLORS.red} 30%, ${LEGACY_COLORS.border})`
          : LEGACY_COLORS.border;

        return (
          <button
            key={g.process_code}
            type="button"
            onClick={() => onSelect(g.process_code)}
            className="overflow-hidden rounded-[18px] border text-left transition-all duration-150 hover:brightness-95"
            style={{
              padding: 0,
              display: "flex",
              background: cardBg,
              borderColor,
              boxShadow: isActive
                ? `0 0 0 1.5px color-mix(in srgb, ${accentColor} 18%, transparent), var(--c-card-shadow)`
                : undefined,
            }}
          >
            {/* 왼쪽 accent bar */}
            <div
              className="w-[3px] shrink-0 self-stretch rounded-l-[18px]"
              style={{
                background: isActive || isDecreasing
                  ? accentColor
                  : `color-mix(in srgb, ${accentColor} 35%, transparent)`,
              }}
            />

            {/* 카드 본문 */}
            <div className="flex-1 p-3">
              {/* 헤더: 부서명 + 코드 배지 */}
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-[12px] font-black" style={{ color: LEGACY_COLORS.text }}>
                  {g.dept_name}
                </span>
                <span
                  className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black"
                  style={{
                    color: accentColor,
                    background: `color-mix(in srgb, ${accentColor} 12%, ${LEGACY_COLORS.s2})`,
                  }}
                >
                  {g.process_code}
                </span>
              </div>

              {/* 현재재고 */}
              <div className="mt-2">
                <div className="text-[10px]" style={{ color: LEGACY_COLORS.muted }}>
                  현재재고
                </div>
                <div className="text-[17px] font-black leading-tight" style={{ color: LEGACY_COLORS.text }}>
                  {fmt(Number(g.current_qty))}
                </div>
              </div>

              {/* 증감 + 상태 배지 */}
              <div className="mt-1.5 flex items-center gap-1.5">
                <span
                  className="text-[12px] font-black"
                  style={{ color: statusBadge.color }}
                >
                  {delta > 0 ? `+${fmt(delta)}` : delta < 0 ? fmt(delta) : "±0"}
                </span>
                <span
                  className="rounded-full px-1.5 py-px text-[9px] font-black"
                  style={{
                    color: statusBadge.color,
                    background: `color-mix(in srgb, ${statusBadge.color} 10%, ${LEGACY_COLORS.s2})`,
                  }}
                >
                  {statusBadge.text}
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
