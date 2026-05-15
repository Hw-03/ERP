"use client";

import React from "react";
import { LEGACY_COLORS, getDepartmentFallbackColor } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import type { WeeklyProductionModelRow } from "@/lib/api/types/weekly";

type NumCol = keyof Pick<
  WeeklyProductionModelRow,
  "tf_qty" | "hf_qty" | "vf_qty" | "nf_qty" | "af_qty" | "pf_qty"
>;

const COLS: { key: NumCol; label: string; dept: string }[] = [
  { key: "tf_qty", label: "튜브", dept: "튜브" },
  { key: "hf_qty", label: "고압", dept: "고압" },
  { key: "vf_qty", label: "진공", dept: "진공" },
  { key: "nf_qty", label: "튜닝", dept: "튜닝" },
  { key: "af_qty", label: "조립", dept: "조립" },
  { key: "pf_qty", label: "출하", dept: "출하" },
];

function fmt(n: number): string {
  return n === 0 ? "—" : Math.round(n).toLocaleString();
}

const ZERO_FADE = `color-mix(in srgb, ${LEGACY_COLORS.muted2} 30%, transparent)`;

interface Props {
  rows: WeeklyProductionModelRow[];
}

export const WeeklyProductionMatrix = React.memo(function WeeklyProductionMatrix({
  rows,
}: Props) {
  const hasAny = rows.some((r) => r.total_qty > 0);

  if (!hasAny) {
    return (
      <div className="flex flex-col items-center gap-1 py-4">
        <span className="text-[13px] font-bold" style={{ color: LEGACY_COLORS.muted }}>
          이번 주 생산 실적 없음
        </span>
        <span className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
          선택 주차 기준 모델별 생산 완료 기록이 없습니다.
        </span>
      </div>
    );
  }

  const altBg = tint(LEGACY_COLORS.s2, 50, LEGACY_COLORS.s1);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ background: LEGACY_COLORS.s2 }}>
            <th
              className="py-2 px-3 text-center text-[13px] font-bold tracking-wide"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              모델
            </th>
            {COLS.map((c) => {
              const deptColor = getDepartmentFallbackColor(c.dept);
              return (
                <th
                  key={c.key}
                  className="px-3 py-2 text-center text-[14px] font-black tracking-wide"
                  style={{ color: deptColor }}
                >
                  {c.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isAlt = i % 2 === 1;
            const hasData = row.total_qty > 0;
            return (
              <tr
                key={row.model_key}
                style={{ background: isAlt ? altBg : LEGACY_COLORS.s1 }}
              >
                <td
                  className={`py-2.5 px-3 text-center text-[15px] ${hasData ? "font-black" : "font-semibold"}`}
                  style={{ color: hasData ? LEGACY_COLORS.text : LEGACY_COLORS.muted }}
                >
                  {row.model_label}
                </td>
                {COLS.map((c) => {
                  const val = row[c.key];
                  const deptColor = getDepartmentFallbackColor(c.dept);
                  const hasVal = val > 0;
                  return (
                    <td
                      key={c.key}
                      className={`px-3 py-2.5 text-center text-[16px] tabular-nums ${hasVal ? "font-black" : "font-medium"}`}
                      style={{
                        color: hasVal ? deptColor : ZERO_FADE,
                        background: hasVal
                          ? `color-mix(in srgb, ${deptColor} 15%, transparent)`
                          : undefined,
                      }}
                    >
                      {fmt(val)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});
