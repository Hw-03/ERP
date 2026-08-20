"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { adminApi } from "@/lib/api/admin";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { Button } from "@/lib/ui/Button";
import type { WeeklyProductionModelRow } from "@/lib/api/types/weekly";
import { useWeeklyReportQuery } from "@/lib/queries/useWeeklyQuery";
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
  const [selectedCode, setSelectedCode] = useState("TF");
  const [f705Downloading, setF705Downloading] = useState(false);
  const [f705DownloadError, setF705DownloadError] = useState<string | null>(null);

  const weekStart = toDateStr(weekMon);
  const weekEnd = toDateStr(new Date(weekMon.getTime() + 6 * 86400000));
  const reportQuery = useWeeklyReportQuery({ week_start: weekStart, week_end: weekEnd });
  const data = reportQuery.data ?? null;
  const loading = reportQuery.isLoading && !data;
  const error = reportQuery.error ? "주간보고 데이터를 불러오지 못했습니다." : null;

  useEffect(() => {
    if (!data) return;
    setSelectedCode((prev) => {
      if (data.groups.length > 0 && !data.groups.find((g) => g.process_code === prev)) {
        return data.groups[0].process_code;
      }
      return prev;
    });
  }, [data]);

  const selectedGroup = data?.groups.find((g) => g.process_code === selectedCode);

  const cardBase = {
    background: LEGACY_COLORS.s1,
    borderColor: LEGACY_COLORS.border,
  };

  const matrixRows = data?.production_matrix ?? [];
  const hasProduction = matrixRows.some((r) => r.total_qty > 0);

  // KPI 계산
  const totalQty = matrixRows.reduce((s, r) => s + r.total_qty, 0);
  const topModel = matrixRows.reduce(
    (best, r) => (r.total_qty > (best?.total_qty ?? 0) ? r : best),
    null as WeeklyProductionModelRow | null
  );
  const activeDepts = data?.groups.filter((g) => g.produce_qty > 0).length ?? 0;
  const totalDepts = data?.groups.length ?? 0;

  async function handleF705Download(): Promise<void> {
    if (f705Downloading) return;
    const year = weekMon.getFullYear();
    setF705Downloading(true);
    setF705DownloadError(null);
    try {
      const blob = await adminApi.downloadF705ProductionLog(year);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `F705-02 (R01) ${year} 생산일지.xlsx`;
      try {
        document.body.appendChild(link);
        link.click();
      } finally {
        if (link.parentNode) link.parentNode.removeChild(link);
        URL.revokeObjectURL(objectUrl);
      }
    } catch (error) {
      setF705DownloadError(error instanceof Error ? error.message : "생산일지 다운로드에 실패했습니다.");
    } finally {
      setF705Downloading(false);
    }
  }

  const f705DownloadButton = (
    <div data-testid="weekly-f705-download-anchor" className="ml-auto lg:absolute lg:right-4 lg:top-2">
      <Button
        size="sm"
        iconLeft={<Download />}
        loading={f705Downloading}
        onClick={() => void handleF705Download()}
        style={{ background: LEGACY_COLORS.greenSolid, color: LEGACY_COLORS.white }}
      >
        {f705Downloading ? "생산일지 생성 중..." : "F705-02 생산일지 다운로드"}
      </Button>
    </div>
  );

  return (
    <div className="flex-1 min-h-0 min-w-0 overflow-y-auto flex flex-col gap-3 py-1 pr-1 lg:overflow-hidden">
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
        if (!hasProduction) {
          return (
            <div
              data-testid="weekly-production-card"
              className="relative shrink-0 rounded-[12px] border px-4 py-2"
              style={cardBase}
            >
              <div className="flex items-center gap-3">
                <span
                  className="text-[11px] font-bold tracking-wide"
                  style={{ color: LEGACY_COLORS.muted2 }}
                >
                  생산 현황
                </span>
                <span className="text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  이번 주 생산 실적 없음 · 모델별 공정 생산 기록이 없습니다.
                </span>
                {f705DownloadButton}
              </div>
              {f705DownloadError && <p role="alert" className="mt-2 text-[12px] font-bold" style={{ color: LEGACY_COLORS.red }}>{f705DownloadError}</p>}
            </div>
          );
        }
        return (
          <div data-testid="weekly-production-card" className="relative shrink-0 rounded-[18px] border py-3 px-4" style={cardBase}>
            {/* 헤더: 타이틀 + KPI 배지 */}
            <div className="mb-2 flex flex-wrap items-center gap-2 lg:flex-nowrap lg:whitespace-nowrap lg:pr-[220px]">
              <h2 className="text-[15px] font-black" style={{ color: LEGACY_COLORS.text }}>
                생산 현황
              </h2>
              {/* KPI 배지 */}
              <span
                className="rounded-[7px] px-2 py-0.5 text-[12px] font-bold tabular-nums"
                style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text }}
              >
                총 {totalQty.toLocaleString()}개
              </span>
              {topModel && (
                <span
                  className="rounded-[7px] px-2 py-0.5 text-[12px] font-bold"
                  style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.blue }}
                >
                  최다 {topModel.model_label} ({topModel.total_qty.toLocaleString()})
                </span>
              )}
              <span
                className="rounded-[7px] px-2 py-0.5 text-[12px] font-bold tabular-nums"
                style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.muted2 }}
              >
                생산 부서 {activeDepts}/{totalDepts}
              </span>
              {f705DownloadButton}
            </div>
            {f705DownloadError && <p role="alert" className="mb-2 text-[12px] font-bold" style={{ color: LEGACY_COLORS.red }}>{f705DownloadError}</p>}
            <WeeklyProductionMatrix rows={matrixRows} />
          </div>
        );
      })()}

      {/* ── 행2: 2-column (공정별 변화 | 품목 상세) ── 남은 높이 전부 사용 */}
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-1 lg:min-h-0">
        {/* 좌: 공정별 변화 */}
        <div
          className="flex w-full shrink-0 flex-col overflow-hidden rounded-[18px] border min-h-[220px] lg:w-[330px] lg:min-h-0 lg:max-h-full"
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
          <div className="min-h-0 flex-1 overflow-hidden p-2">
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
        <div className="flex flex-1 flex-col min-w-0 rounded-[18px] border min-h-[280px] lg:min-h-0" style={cardBase}>
          {/* min-h-0 — flex 체인에서 자식의 overflow-y-auto 가 동작하려면 모든 ancestor 가 min-h-0 필요.
              누락 시 자식 content 크기가 부모를 밀어내서 스크롤이 안 잡힘. */}
          <div
            className="flex min-h-0 flex-1 flex-col"
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
