"use client";

import { memo } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import type { WeeklyReportResponse } from "@/lib/api/types/weekly";

interface Props {
  data: WeeklyReportResponse;
}

interface KpiTile {
  key: string;
  label: string;
  value: string;
  valueColor: string;
  hint?: string;
}

function WeeklyKpiStripImpl({ data }: Props) {
  const { summary } = data;
  const noActivity = summary.total_in_qty === 0 && summary.total_out_qty === 0;
  const net = summary.total_in_qty - summary.total_out_qty;
  const changedGroups = summary.groups_increasing + summary.groups_decreasing;

  const mutedTone = LEGACY_COLORS.muted2;

  const inColor = summary.total_in_qty > 0 ? LEGACY_COLORS.green : mutedTone;
  const outColor = summary.total_out_qty > 0 ? LEGACY_COLORS.yellow : mutedTone;
  const netColor =
    noActivity
      ? mutedTone
      : net > 0
      ? LEGACY_COLORS.green
      : net < 0
      ? LEGACY_COLORS.red
      : mutedTone;
  const groupsColor = changedGroups > 0 ? LEGACY_COLORS.yellow : mutedTone;

  const tiles: KpiTile[] = [
    {
      key: "in",
      label: "생산/입고",
      value: noActivity ? "—" : formatQty(summary.total_in_qty),
      valueColor: inColor,
      hint: noActivity ? "활동 없음" : "이번 주 합계",
    },
    {
      key: "out",
      label: "출고/소비",
      value: noActivity ? "—" : formatQty(summary.total_out_qty),
      valueColor: outColor,
      hint: noActivity ? "활동 없음" : "이번 주 합계",
    },
    {
      key: "net",
      label: "순증감",
      value: noActivity
        ? "—"
        : net > 0
        ? `+${formatQty(net)}`
        : net < 0
        ? formatQty(net)
        : "±0",
      valueColor: netColor,
      hint: noActivity ? "—" : "생산 − 출고",
    },
    {
      key: "groups",
      label: "변동 공정",
      value: changedGroups === 0 ? "0" : `${changedGroups}`,
      valueColor: groupsColor,
      hint:
        changedGroups === 0
          ? "모든 공정 변동 없음"
          : `+${summary.groups_increasing} / -${summary.groups_decreasing}`,
    },
  ];

  return (
    <div className="grid shrink-0 grid-cols-4 gap-3">
      {tiles.map((t) => (
        <div
          key={t.key}
          className="rounded-[14px] border px-4 py-3"
          style={{
            background: LEGACY_COLORS.s1,
            borderColor: LEGACY_COLORS.border,
          }}
        >
          <div
            className="text-[11px] font-bold"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            {t.label}
          </div>
          <div
            className="mt-1 text-[28px] font-black leading-none tabular-nums"
            style={{ color: t.valueColor }}
          >
            {t.value}
          </div>
          {t.hint && (
            <div
              className="mt-1.5 text-[11px]"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              {t.hint}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export const WeeklyKpiStrip = memo(WeeklyKpiStripImpl);
