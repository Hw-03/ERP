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

        return (
          <button
            key={g.process_code}
            type="button"
            onClick={() => onSelect(g.process_code)}
            className="rounded-[18px] border p-3 text-left transition-all duration-150 hover:brightness-95"
            style={{
              background: isActive ? LEGACY_COLORS.s2 : LEGACY_COLORS.s1,
              borderColor: isActive
                ? `color-mix(in srgb, ${accentColor} 50%, ${LEGACY_COLORS.border})`
                : LEGACY_COLORS.border,
              boxShadow: isActive
                ? `0 0 0 1px color-mix(in srgb, ${accentColor} 15%, transparent)`
                : undefined,
            }}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between gap-1">
              <span className="truncate text-[13px] font-black" style={{ color: LEGACY_COLORS.text }}>
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
              <div className="text-[18px] font-black leading-tight" style={{ color: LEGACY_COLORS.text }}>
                {fmt(Number(g.current_qty))}
              </div>
            </div>

            {/* 증감 */}
            <div className="mt-1.5 flex items-center gap-1">
              <span
                className="text-[13px] font-black"
                style={{
                  color:
                    delta > 0
                      ? LEGACY_COLORS.green
                      : delta < 0
                      ? LEGACY_COLORS.red
                      : LEGACY_COLORS.muted,
                }}
              >
                {delta > 0 ? `+${fmt(delta)}` : delta < 0 ? fmt(delta) : "±0"}
              </span>
              {delta < 0 && (
                <span className="text-[10px] font-bold" style={{ color: LEGACY_COLORS.red }}>
                  확인
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export const WeeklyGroupCards = memo(WeeklyGroupCardsImpl);
