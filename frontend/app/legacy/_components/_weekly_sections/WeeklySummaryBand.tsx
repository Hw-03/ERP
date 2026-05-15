"use client";

import { memo } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import type { WeeklyReportResponse } from "@/lib/api/types/weekly";

interface Props {
  data: WeeklyReportResponse;
}

type SummaryLevel = "neutral" | "warn" | "danger";

interface SummaryInfo {
  level: SummaryLevel;
  headline: string;
}

function getSummaryInfo(data: WeeklyReportResponse): SummaryInfo {
  const { summary, warnings } = data;

  if (summary.total_in_qty === 0 && summary.total_out_qty === 0) {
    return {
      level: "neutral",
      headline: "선택 주차에는 공정완료품 입출고 변동이 없습니다.",
    };
  }

  const dangerWarning = warnings.find((w) => w.level === "danger");
  if (dangerWarning) {
    return { level: "danger", headline: dangerWarning.title };
  }

  if (summary.groups_decreasing > 0) {
    return {
      level: "warn",
      headline: `감소 공정 ${summary.groups_decreasing}개 · 확인이 필요합니다.`,
    };
  }

  const warnWarning = warnings.find((w) => w.level === "warn");
  if (warnWarning) {
    return { level: "warn", headline: warnWarning.title };
  }

  return {
    level: "neutral",
    headline: "공정완료품 흐름이 안정적입니다.",
  };
}

function WeeklySummaryBandImpl({ data }: Props) {
  const info = getSummaryInfo(data);
  const { summary } = data;
  const noActivity = summary.total_in_qty === 0 && summary.total_out_qty === 0;

  const toneColor =
    info.level === "danger"
      ? LEGACY_COLORS.red
      : info.level === "warn"
      ? LEGACY_COLORS.yellow
      : LEGACY_COLORS.text;

  const borderColor =
    info.level === "danger"
      ? tint(LEGACY_COLORS.red, 40, LEGACY_COLORS.border)
      : info.level === "warn"
      ? tint(LEGACY_COLORS.yellow, 40, LEGACY_COLORS.border)
      : LEGACY_COLORS.border;

  const bgColor =
    info.level === "danger"
      ? tint(LEGACY_COLORS.red, 10, LEGACY_COLORS.s1)
      : info.level === "warn"
      ? tint(LEGACY_COLORS.yellow, 10, LEGACY_COLORS.s1)
      : LEGACY_COLORS.s1;

  return (
    <div
      className="shrink-0 rounded-[18px] border px-5 py-3"
      style={{ background: bgColor, borderColor }}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="shrink-0 text-[11px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
          이번 주 총평
        </span>
        <span className="text-[15px] font-black" style={{ color: toneColor }}>
          {info.headline}
        </span>
      </div>
      {noActivity && (
        <div className="mt-0.5 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
          현재 화면은 공정별 잔량과 품목별 근거를 참고용으로 표시합니다.
        </div>
      )}
    </div>
  );
}

export const WeeklySummaryBand = memo(WeeklySummaryBandImpl);
