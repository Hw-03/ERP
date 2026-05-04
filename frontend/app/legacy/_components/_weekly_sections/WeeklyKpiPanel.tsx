"use client";

import { memo } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { WeeklyReportResponse } from "@/lib/api/types/weekly";
import { LoadingSkeleton } from "../common/LoadingSkeleton";

interface Props {
  data: WeeklyReportResponse | undefined;
  loading: boolean;
}

function WeeklyKpiPanelImpl({ data, loading }: Props) {
  if (loading) {
    return (
      <div
        className="flex h-full flex-col rounded-[22px] border"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        <div
          className="flex shrink-0 items-center border-b px-4 py-3"
          style={{ borderColor: LEGACY_COLORS.border }}
        >
          <h2 className="text-[14px] font-black" style={{ color: LEGACY_COLORS.text }}>
            확인 사항
          </h2>
        </div>
        <div className="p-3">
          <LoadingSkeleton variant="list" rows={4} />
        </div>
      </div>
    );
  }

  const warnings = data?.warnings ?? [];

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-[22px] border"
      style={{
        background: LEGACY_COLORS.s1,
        borderColor: LEGACY_COLORS.border,
        boxShadow: "var(--c-card-shadow)",
      }}
    >
      <div
        className="flex shrink-0 items-center border-b px-4 py-3"
        style={{ borderColor: LEGACY_COLORS.border }}
      >
        <h2 className="text-[14px] font-black" style={{ color: LEGACY_COLORS.text }}>
          확인 사항
        </h2>
      </div>

      <div className="flex flex-col gap-2 overflow-auto p-3">
        {warnings.length === 0 ? (
          <p
            className="py-6 text-center text-[12px]"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            확인할 특이사항이 없습니다.
          </p>
        ) : (
          warnings.map((w, i) => (
            <div
              key={i}
              className="rounded-[14px] border p-3"
              style={{
                borderColor:
                  w.level === "danger"
                    ? `color-mix(in srgb, ${LEGACY_COLORS.red} 30%, ${LEGACY_COLORS.border})`
                    : w.level === "warn"
                    ? `color-mix(in srgb, ${LEGACY_COLORS.yellow} 30%, ${LEGACY_COLORS.border})`
                    : `color-mix(in srgb, ${LEGACY_COLORS.green} 25%, ${LEGACY_COLORS.border})`,
                background:
                  w.level === "danger"
                    ? `color-mix(in srgb, ${LEGACY_COLORS.red} 5%, ${LEGACY_COLORS.s1})`
                    : w.level === "warn"
                    ? `color-mix(in srgb, ${LEGACY_COLORS.yellow} 5%, ${LEGACY_COLORS.s1})`
                    : `color-mix(in srgb, ${LEGACY_COLORS.green} 5%, ${LEGACY_COLORS.s1})`,
              }}
            >
              <div
                className="text-[12px] leading-relaxed"
                style={{ color: LEGACY_COLORS.text }}
              >
                {w.message}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export const WeeklyKpiPanel = memo(WeeklyKpiPanelImpl);
