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
  const altBg = tint(LEGACY_COLORS.s2, 50, LEGACY_COLORS.s1);

  // 열별 최댓값 계산 (농도 비례 히트맵용)
  const colMax: Record<NumCol, number> = {} as Record<NumCol, number>;
  for (const c of COLS) {
    colMax[c.key] = Math.max(...rows.map((r) => r[c.key]), 1);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ background: LEGACY_COLORS.s2 }}>
            <th
              scope="col"
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
                  scope="col"
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
                  // 열 최댓값 대비 비율로 8~40% 선형 보간
                  const tintPct = hasVal
                    ? Math.round(8 + (val / colMax[c.key]) * 32)
                    : 0;
                  return (
                    <td
                      key={c.key}
                      className={`px-3 py-2.5 text-center text-[16px] tabular-nums ${hasVal ? "font-black" : "font-medium"}`}
                      style={{
                        color: hasVal ? deptColor : ZERO_FADE,
                        background: hasVal
                          ? `color-mix(in srgb, ${deptColor} ${tintPct}%, transparent)`
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
