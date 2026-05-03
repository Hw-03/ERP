"use client";

import { memo } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { WeeklyReportResponse } from "@/lib/api/types/weekly";
import { LoadingSkeleton } from "../common/LoadingSkeleton";

function fmt(n: number) {
  return Number(n).toLocaleString("ko-KR");
}

interface Props {
  data: WeeklyReportResponse | undefined;
  loading: boolean;
}

function WeeklyKpiPanelImpl({ data, loading }: Props) {
  if (loading) {
    return <LoadingSkeleton variant="list" rows={5} />;
  }

  if (!data) return null;

  const { summary, warnings } = data;

  const kpis = [
    {
      label: "총 생산/입고",
      value: fmt(Number(summary.total_in_qty)),
      color: LEGACY_COLORS.cyan,
    },
    {
      label: "순증가 그룹",
      value: `${summary.groups_increasing}개`,
      color: LEGACY_COLORS.green,
    },
    {
      label: "감소 확인 필요",
      value: `${summary.groups_decreasing}개`,
      color: LEGACY_COLORS.red,
    },
  ];

  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
      {/* KPI */}
      <div
        className="rounded-[20px] border overflow-hidden"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: LEGACY_COLORS.border }}
        >
          <h2 className="text-[15px] font-black" style={{ color: LEGACY_COLORS.text }}>
            이번 주 요약
          </h2>
          <span className="text-[12px]" style={{ color: LEGACY_COLORS.muted }}>
            전체 ?F 기준
          </span>
        </div>
        <div className="flex flex-col gap-2 p-3">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-[16px] border p-3"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted }}>
                {kpi.label}
              </div>
              <div className="mt-1 text-[22px] font-black" style={{ color: kpi.color }}>
                {kpi.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 특이사항 */}
      <div
        className="min-h-0 flex-1 overflow-hidden flex flex-col rounded-[20px] border"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: LEGACY_COLORS.border }}
        >
          <h2 className="text-[15px] font-black" style={{ color: LEGACY_COLORS.text }}>
            특이사항
          </h2>
          <span className="text-[12px]" style={{ color: LEGACY_COLORS.muted }}>
            자동 코멘트
          </span>
        </div>
        <div className="flex flex-col gap-2 overflow-auto p-3">
          {warnings.length === 0 ? (
            <p
              className="py-4 text-center text-[12px]"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              특이사항이 없습니다
            </p>
          ) : (
            warnings.map((w, i) => (
              <div
                key={i}
                className="rounded-[16px] border p-3"
                style={{
                  borderColor:
                    w.level === "danger"
                      ? `color-mix(in srgb, ${LEGACY_COLORS.red} 35%, ${LEGACY_COLORS.border})`
                      : w.level === "warn"
                      ? `color-mix(in srgb, ${LEGACY_COLORS.yellow} 35%, ${LEGACY_COLORS.border})`
                      : `color-mix(in srgb, ${LEGACY_COLORS.green} 30%, ${LEGACY_COLORS.border})`,
                  background:
                    w.level === "danger"
                      ? `color-mix(in srgb, ${LEGACY_COLORS.red} 7%, ${LEGACY_COLORS.s1})`
                      : w.level === "warn"
                      ? `color-mix(in srgb, ${LEGACY_COLORS.yellow} 7%, ${LEGACY_COLORS.s1})`
                      : `color-mix(in srgb, ${LEGACY_COLORS.green} 7%, ${LEGACY_COLORS.s1})`,
                }}
              >
                <div className="text-[12px] font-black" style={{ color: LEGACY_COLORS.text }}>
                  {w.title}
                </div>
                <div
                  className="mt-1 text-[11px] leading-relaxed"
                  style={{ color: LEGACY_COLORS.muted }}
                >
                  {w.message}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export const WeeklyKpiPanel = memo(WeeklyKpiPanelImpl);
