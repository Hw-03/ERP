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
    <div data-testid="weekly-f705-download-anchor" className="weekly-download">
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

  if (data?.report_status === "failed") {
    return (
      <section role="alert" className="weekly-failed">
        <h2>집계 검산 실패</h2>
        <p>{data.validation?.message ?? "잘못된 주간 표를 공개하지 않았습니다."}</p>
        <ul>
          {(data.validation?.failures ?? []).map((failure) => <li key={failure.problem_id}>
            <b>{failure.mes_code ?? failure.item_id ?? "보고 전체"}</b> · {failure.reason} · {failure.problem_id}
          </li>)}
        </ul>
      </section>
    );
  }

  const basisNotice = data?.report_status === "transition"
    ? data.transition_notice
    : data?.report_status === "legacy" && data.basis_version === 1
      ? "기존 기준·검산 전 자료입니다."
      : null;

  return (
    <div className="weekly-report">
      {basisNotice && <div role="status" className="weekly-notice">
        {basisNotice}
      </div>}
      {error && (
        <div className="weekly-error">{error}</div>
      )}

      {/* ── 행1: 생산 현황 (빈 상태는 얇은 노트로 축소) ── */}
      {(() => {
        if (loading && !data) {
          return (
            <div className="weekly-card weekly-loading">
              <LoadingSkeleton variant="card" rows={1} />
            </div>
          );
        }
        if (!hasProduction) {
          return (
            <div data-testid="weekly-production-card" className="weekly-card weekly-production-empty">
              <div>
                <b>생산 현황</b>
                <span>
                  이번 주 생산 실적 없음 · 모델별 공정 생산 기록이 없습니다.
                </span>
                {f705DownloadButton}
              </div>
              {f705DownloadError && <p role="alert" className="weekly-download-error">{f705DownloadError}</p>}
            </div>
          );
        }
        return (
          <div data-testid="weekly-production-card" className="weekly-card weekly-production">
            {/* 헤더: 타이틀 + KPI 배지 */}
            <div className="weekly-production-head">
              <h2>생산 현황</h2>
              {/* KPI 배지 */}
              <span
                data-tone="total"
              >
                총 {totalQty.toLocaleString()}개
              </span>
              {topModel && (
                <span
                  data-tone="top"
                >
                  최다 {topModel.model_label} ({topModel.total_qty.toLocaleString()})
                </span>
              )}
              <span
                data-tone="department"
              >
                생산 부서 {activeDepts}/{totalDepts}
              </span>
              {f705DownloadButton}
            </div>
            {f705DownloadError && <p role="alert" className="weekly-download-error">{f705DownloadError}</p>}
            <WeeklyProductionMatrix rows={matrixRows} />
          </div>
        );
      })()}

      {/* ── 행2: 2-column (공정별 변화 | 품목 상세) ── 남은 높이 전부 사용 */}
      <div className="weekly-report-body">
        {/* 좌: 공정별 변화 */}
        <div className="weekly-card weekly-group-panel">
          <header>
            <h2>공정별 변화</h2>
          </header>
          <div>
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
        <div className="weekly-card weekly-detail-panel">
          {/* min-h-0 — flex 체인에서 자식의 overflow-y-auto 가 동작하려면 모든 ancestor 가 min-h-0 필요.
              누락 시 자식 content 크기가 부모를 밀어내서 스크롤이 안 잡힘. */}
          <div>
            <header>
              <h2>
                {selectedGroup ? `${selectedGroup.dept_name} 품목 상세` : "품목 상세"}
              </h2>
            </header>
            <div className="weekly-detail-content">
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
