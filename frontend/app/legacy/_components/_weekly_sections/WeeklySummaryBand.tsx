"use client";

import { memo } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import type { WeeklyReportResponse } from "@/lib/api/types/weekly";

interface Props {
  data: WeeklyReportResponse;
}

type SummaryLevel = "neutral" | "warn" | "danger";

interface SummaryInfo {
  level: SummaryLevel;
  headline: string;
  sub: string;
}

function getSummaryInfo(data: WeeklyReportResponse): SummaryInfo {
  const { summary, warnings } = data;

  if (summary.total_in_qty === 0 && summary.total_out_qty === 0) {
    return {
      level: "neutral",
      headline: "선택 주차에는 공정완료품 입출고 변동이 없습니다.",
      sub: "생산/입고 0 · 출고/소비 0 · 순변동 ±0",
    };
  }

  const dangerWarning = warnings.find((w) => w.level === "danger");
  if (dangerWarning) {
    return { level: "danger", headline: dangerWarning.title, sub: dangerWarning.message };
  }

  if (summary.groups_decreasing > 0) {
    return {
      level: "warn",
      headline: `감소 공정 ${summary.groups_decreasing}개 · 확인이 필요합니다.`,
      sub: `생산/입고 ${formatQty(summary.total_in_qty)} · 출고/소비 ${formatQty(summary.total_out_qty)} · 감소 ${summary.groups_decreasing}개`,
    };
  }

  const warnWarning = warnings.find((w) => w.level === "warn");
  if (warnWarning) {
    return { level: "warn", headline: warnWarning.title, sub: warnWarning.message };
  }

  const parts: string[] = [];
  if (summary.total_in_qty > 0) parts.push(`생산/입고 ${formatQty(summary.total_in_qty)}`);
  if (summary.total_out_qty > 0) parts.push(`출고/소비 ${formatQty(summary.total_out_qty)}`);
  if (summary.groups_increasing > 0) parts.push(`증가 ${summary.groups_increasing}개`);

  return {
    level: "neutral",
    headline: "공정완료품 흐름이 안정적입니다.",
    sub: parts.join(" · ") || "특이 변동 없음",
  };
}

function WeeklySummaryBandImpl({ data }: Props) {
  const info = getSummaryInfo(data);
  const { summary } = data;
  const hasActivity = summary.total_in_qty > 0 || summary.total_out_qty > 0;

  const toneColor =
    info.level === "danger"
      ? LEGACY_COLORS.red
      : info.level === "warn"
      ? LEGACY_COLORS.yellow
      : LEGACY_COLORS.muted;

  const borderColor =
    info.level === "danger"
      ? tint(LEGACY_COLORS.red, 40, LEGACY_COLORS.border)
      : info.level === "warn"
      ? tint(LEGACY_COLORS.yellow, 40, LEGACY_COLORS.border)
      : LEGACY_COLORS.border;

  const bgColor =
    info.level === "danger"
      ? tint(LEGACY_COLORS.red, 5, LEGACY_COLORS.s1)
      : info.level === "warn"
      ? tint(LEGACY_COLORS.yellow, 6, LEGACY_COLORS.s1)
      : LEGACY_COLORS.s1;

  const kpiItems = [
    {
      label: "생산 / 입고",
      value: formatQty(summary.total_in_qty),
      color: LEGACY_COLORS.green,
    },
    {
      label: "출고 / 소비",
      value: formatQty(summary.total_out_qty),
      color: LEGACY_COLORS.red,
    },
    {
      label: "증가 공정",
      value: `${summary.groups_increasing}개`,
      color: LEGACY_COLORS.cyan,
    },
    {
      label: "감소 공정",
      value: `${summary.groups_decreasing}개`,
      color: summary.groups_decreasing > 0 ? LEGACY_COLORS.red : LEGACY_COLORS.muted2,
    },
  ];

  return (
    <div
      className="shrink-0 rounded-[18px] border"
      style={{ background: bgColor, borderColor }}
    >
      {/* KPI 수치 row */}
      {hasActivity && (
        <div
          className="grid grid-cols-4"
          style={{ borderBottom: `1px solid ${borderColor}` }}
        >
          {kpiItems.map((item, i) => (
            <div
              key={item.label}
              className="flex flex-col items-center gap-0.5 px-4 py-3"
              style={i > 0 ? { borderLeft: `1px solid ${borderColor}` } : undefined}
            >
              <span className="text-[11px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                {item.label}
              </span>
              <span className="text-[22px] font-black leading-none tabular-nums" style={{ color: item.color }}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 상태 메시지 row */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3">
        <span className="shrink-0 text-[11px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
          이번 주 총평
        </span>
        <span className="text-[13px] font-bold" style={{ color: toneColor }}>
          {info.headline}
        </span>
        {hasActivity && (
          <span className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
            {info.sub}
          </span>
        )}
      </div>
    </div>
  );
}

export const WeeklySummaryBand = memo(WeeklySummaryBandImpl);
