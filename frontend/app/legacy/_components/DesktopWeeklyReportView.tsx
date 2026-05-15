"use client";

import { useEffect, useState } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { api } from "@/lib/api";
import type { WeeklyReportResponse } from "@/lib/api/types/weekly";
import { WeeklyGroupCards } from "./_weekly_sections/WeeklyGroupCards";
import { WeeklyDetailTable } from "./_weekly_sections/WeeklyDetailTable";
import { WeeklyProductionMatrix } from "./_weekly_sections/WeeklyProductionMatrix";
import { LoadingSkeleton } from "./common";

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface Props {
  weekMon: Date;
}

export function DesktopWeeklyReportView({ weekMon }: Props) {
  const [data, setData] = useState<WeeklyReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState("TF");

  const weekStart = toDateStr(weekMon);
  const weekEnd = toDateStr(new Date(weekMon.getTime() + 6 * 86400000));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getWeeklyReport({ week_start: weekStart, week_end: weekEnd })
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setSelectedCode((prev) => {
          if (res.groups.length > 0 && !res.groups.find((g) => g.process_code === prev)) {
            return res.groups[0].process_code;
          }
          return prev;
        });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError("주간보고 데이터를 불러오지 못했습니다.");
          console.error(e);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [weekStart, weekEnd]);

  const selectedGroup = data?.groups.find((g) => g.process_code === selectedCode);

  const cardBase = {
    background: LEGACY_COLORS.s1,
    borderColor: LEGACY_COLORS.border,
  };

  return (
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-3 py-1 pr-1">
      {error && (
        <div
          className="shrink-0 rounded-[10px] border px-3 py-1.5 text-[12px]"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.red} 6%, ${LEGACY_COLORS.s1})`,
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 30%, ${LEGACY_COLORS.border})`,
            color: LEGACY_COLORS.red,
          }}
        >
          {error}
        </div>
      )}

      {/* ── 행1: 생산 현황 (빈 상태는 얇은 노트로 축소) ── */}
      {(() => {
        if (loading && !data) {
          return (
            <div className="shrink-0 rounded-[18px] border py-2.5 px-4" style={cardBase}>
              <LoadingSkeleton variant="card" rows={1} />
            </div>
          );
        }
        const rows = data?.production_matrix ?? [];
        const hasProduction = rows.some((r) => r.total_qty > 0);
        if (!hasProduction) {
          return (
            <div
              className="flex shrink-0 items-center justify-between rounded-[12px] border px-4 py-2"
              style={cardBase}
            >
              <span
                className="text-[11px] font-bold tracking-wide"
                style={{ color: LEGACY_COLORS.muted }}
              >
                생산 현황
              </span>
              <span className="text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
                이번 주 생산 실적 없음 · 모델별 공정 생산 기록이 없습니다.
              </span>
            </div>
          );
        }
        return (
          <div className="shrink-0 rounded-[18px] border py-3 px-4" style={cardBase}>
            <h2 className="mb-2 text-[15px] font-black" style={{ color: LEGACY_COLORS.text }}>
              생산 현황
            </h2>
            <WeeklyProductionMatrix rows={rows} />
          </div>
        );
      })()}

      {/* ── 행2: 2-column (공정별 변화 | 품목 상세) ── 남은 높이 전부 사용 */}
      <div className="flex flex-1 min-h-0 gap-3">
        {/* 좌: 공정별 변화 */}
        <div
          className="flex w-[330px] shrink-0 flex-col overflow-hidden rounded-[18px] border"
          style={cardBase}
        >
          <div
            className="shrink-0 border-b px-3 py-2.5"
            style={{ borderColor: LEGACY_COLORS.border }}
          >
            <h2 className="text-[15px] font-black" style={{ color: LEGACY_COLORS.text }}>
              공정별 변화
            </h2>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden p-2.5">
            {loading && !data ? (
              <LoadingSkeleton variant="card" rows={4} />
            ) : (
              <WeeklyGroupCards
                groups={data?.groups ?? []}
                selected={selectedCode}
                onSelect={setSelectedCode}
                cols={1}
              />
            )}
          </div>
        </div>

        {/* 우: 품목 상세 */}
        <div className="relative flex-1">
          <div
            className="absolute inset-0 flex flex-col rounded-[18px] border"
            style={cardBase}
          >
            <div
              className="shrink-0 border-b px-4 py-2.5"
              style={{ borderColor: LEGACY_COLORS.border }}
            >
              <h2 className="text-[15px] font-black" style={{ color: LEGACY_COLORS.text }}>
                {selectedGroup ? `${selectedGroup.dept_name} 품목 상세` : "품목 상세"}
              </h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-2">
              {loading && !data ? (
                <LoadingSkeleton variant="list" rows={8} />
              ) : (
                <WeeklyDetailTable group={selectedGroup} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
