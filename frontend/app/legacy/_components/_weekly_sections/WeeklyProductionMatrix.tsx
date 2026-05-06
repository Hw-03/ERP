"use client";

import React from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { WeeklyProductionModelRow } from "@/lib/api/types/weekly";

type NumCol = keyof Pick<
  WeeklyProductionModelRow,
  "hf_qty" | "vf_qty" | "nf_qty" | "af_qty" | "total_qty"
>;

const COLS: { key: NumCol; label: string }[] = [
  { key: "hf_qty", label: "고압보드" },
  { key: "vf_qty", label: "고압발생부" },
  { key: "nf_qty", label: "발생부 테스트" },
  { key: "af_qty", label: "완제품조립" },
  { key: "total_qty", label: "합계" },
];

function fmt(n: number): string {
  return n === 0 ? "—" : n.toLocaleString();
}

interface Props {
  rows: WeeklyProductionModelRow[];
}

export const WeeklyProductionMatrix = React.memo(function WeeklyProductionMatrix({
  rows,
}: Props) {
  const hasAny = rows.some((r) => r.total_qty > 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr style={{ background: LEGACY_COLORS.s2 }}>
            <th
              className="py-2 pl-3 pr-4 text-left font-bold"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              모델
            </th>
            {COLS.map((c) => (
              <th
                key={c.key}
                className="px-3 py-2 text-right font-bold"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isAlt = i % 2 === 1;
            const hasData = row.total_qty > 0;
            return (
              <tr
                key={row.model_key}
                style={{ background: isAlt ? LEGACY_COLORS.s2 : LEGACY_COLORS.s1 }}
              >
                <td
                  className="py-2 pl-3 pr-4 font-bold"
                  style={{ color: hasData ? LEGACY_COLORS.text : LEGACY_COLORS.muted }}
                >
                  {row.model_label}
                </td>
                {COLS.map((c) => {
                  const val = row[c.key];
                  const isTotal = c.key === "total_qty";
                  return (
                    <td
                      key={c.key}
                      className="px-3 py-2 text-right tabular-nums"
                      style={{
                        color: val === 0 ? LEGACY_COLORS.muted : LEGACY_COLORS.text,
                        fontWeight: isTotal ? 700 : 400,
                      }}
                    >
                      {fmt(val)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {!hasAny && (
            <tr>
              <td
                colSpan={6}
                className="py-6 text-center text-[12px]"
                style={{ color: LEGACY_COLORS.muted }}
              >
                이번 주 생산 실적 없음
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
});
