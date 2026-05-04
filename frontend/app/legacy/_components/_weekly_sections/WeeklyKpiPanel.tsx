"use client";

import { memo } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { WeeklyReportResponse } from "@/lib/api/types/weekly";
import { LoadingSkeleton } from "../common/LoadingSkeleton";
import { EmptyState } from "../common/EmptyState";

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
          <h2 className="text-[13px] font-black" style={{ color: LEGACY_COLORS.text }}>
            보고 메모
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
        <h2 className="text-[13px] font-black" style={{ color: LEGACY_COLORS.text }}>
          보고 메모
        </h2>
        {warnings.length > 0 && (
          <span
            className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-black"
            style={{
              color: warnings.some((w) => w.level === "danger") ? LEGACY_COLORS.red : LEGACY_COLORS.yellow,
              background: warnings.some((w) => w.level === "danger")
                ? `color-mix(in srgb, ${LEGACY_COLORS.red} 10%, ${LEGACY_COLORS.s2})`
                : `color-mix(in srgb, ${LEGACY_COLORS.yellow} 10%, ${LEGACY_COLORS.s2})`,
            }}
          >
            {warnings.length}건
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 overflow-auto p-3">
        {warnings.length === 0 ? (
          <EmptyState
            variant="no-data"
            title="확인할 특이사항이 없습니다."
            description="선택 주차 기준 입출고 변동이 없는 주차입니다."
            compact
          />
        ) : (
          warnings.map((w, i) => {
            const levelColor =
              w.level === "danger"
                ? LEGACY_COLORS.red
                : w.level === "warn"
                ? LEGACY_COLORS.yellow
                : LEGACY_COLORS.green;
            return (
              <div
                key={i}
                className="rounded-[14px] border p-3"
                style={{
                  borderColor: `color-mix(in srgb, ${levelColor} 28%, ${LEGACY_COLORS.border})`,
                  background: `color-mix(in srgb, ${levelColor} 5%, ${LEGACY_COLORS.s1})`,
                }}
              >
                <div
                  className="mb-0.5 text-[11px] font-black"
                  style={{ color: levelColor }}
                >
                  {w.title}
                </div>
                <div
                  className="text-[11px] leading-relaxed"
                  style={{ color: LEGACY_COLORS.text }}
                >
                  {w.message}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 데이터 기준 */}
      <div
        className="shrink-0 border-t px-4 py-3 text-[10px]"
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
      >
        전주재고는 현재재고와 선택 주차 입출고 내역을 기준으로 계산한 값입니다.
      </div>
    </div>
  );
}

export const WeeklyKpiPanel = memo(WeeklyKpiPanelImpl);
