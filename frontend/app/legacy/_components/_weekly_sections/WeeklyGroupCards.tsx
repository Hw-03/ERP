"use client";

import { memo } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { WeeklyGroupReport } from "@/lib/api/types/weekly";

const PROCESS_COLORS: Record<string, string> = {
  TF: "#4d7c0f",
  HF: "#c2410c",
  VF: "#6d28d9",
  NF: "#0e7490",
  AF: "#1d4ed8",
  PF: "#0f766e",
};

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
    <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
      {groups.map((g) => {
        const isActive = g.process_code === selected;
        const delta = Number(g.delta);
        const accentColor = PROCESS_COLORS[g.process_code] ?? LEGACY_COLORS.blue;

        return (
          <button
            key={g.process_code}
            type="button"
            onClick={() => onSelect(g.process_code)}
            className="rounded-[20px] border p-3 text-left transition-all duration-150 hover:brightness-95"
            style={{
              background: isActive
                ? `linear-gradient(180deg, ${LEGACY_COLORS.s1}, ${LEGACY_COLORS.s2})`
                : LEGACY_COLORS.s1,
              borderColor: isActive
                ? accentColor + "88"
                : LEGACY_COLORS.border,
              outline: isActive ? `2px solid ${accentColor}22` : "none",
              boxShadow: isActive ? `0 0 0 2px ${accentColor}22` : undefined,
            }}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between gap-1">
              <span className="text-[15px] font-black" style={{ color: LEGACY_COLORS.text }}>
                {g.dept_name}
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-black"
                style={{
                  color: accentColor,
                  background: accentColor + "18",
                }}
              >
                {g.process_code}
              </span>
            </div>

            {/* 라벨 */}
            <div
              className="mt-1 truncate text-[11px]"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              {g.label}
            </div>

            {/* 수치 */}
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px]" style={{ color: LEGACY_COLORS.muted }}>
                  전주재고
                </div>
                <div className="text-[16px] font-black" style={{ color: LEGACY_COLORS.text }}>
                  {fmt(Number(g.prev_qty))}
                </div>
              </div>
              <div>
                <div className="text-[10px]" style={{ color: LEGACY_COLORS.muted }}>
                  현재재고
                </div>
                <div className="text-[16px] font-black" style={{ color: LEGACY_COLORS.text }}>
                  {fmt(Number(g.current_qty))}
                </div>
              </div>
            </div>

            {/* 증감 */}
            <div
              className="mt-2 text-[18px] font-black"
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
            </div>
          </button>
        );
      })}
    </div>
  );
}

export const WeeklyGroupCards = memo(WeeklyGroupCardsImpl);
