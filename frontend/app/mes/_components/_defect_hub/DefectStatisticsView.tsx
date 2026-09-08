"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { defectsApi } from "@/lib/api/defects";
import type {
  DefectStatisticsBreakdown,
  DefectStatisticsPeriodKind,
  DefectStatisticsResponse,
} from "@/lib/api/types/defects";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import { DefectCategoryFilters } from "./DefectCategoryFilters";
import type { DefectProcessStep } from "./DefectFilterBar";

interface Props {
  departmentOptions: string[];
  modelOptions: string[];
  currentDepartment: string;
  onBack: () => void;
}

const PERIOD_LABELS: Record<DefectStatisticsPeriodKind, string> = {
  week: "주간",
  month: "월간",
  year: "연간",
};

function todayInKst(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function shiftStatisticsAnchor(
  anchor: string,
  period: DefectStatisticsPeriodKind,
  direction: -1 | 1,
): string {
  const [year, month, day] = anchor.split("-").map(Number);
  let next: Date;
  if (period === "week") {
    next = new Date(Date.UTC(year, month - 1, day + (7 * direction)));
  } else if (period === "month") {
    const targetMonth = (year * 12) + (month - 1) + direction;
    const targetYear = Math.floor(targetMonth / 12);
    const targetMonthIndex = ((targetMonth % 12) + 12) % 12;
    next = new Date(Date.UTC(
      targetYear,
      targetMonthIndex,
      Math.min(day, daysInUtcMonth(targetYear, targetMonthIndex)),
    ));
  } else {
    const targetYear = year + direction;
    const monthIndex = month - 1;
    next = new Date(Date.UTC(
      targetYear,
      monthIndex,
      Math.min(day, daysInUtcMonth(targetYear, monthIndex)),
    ));
  }
  return next.toISOString().slice(0, 10);
}

function periodDisplay(result: DefectStatisticsResponse): string {
  if (result.period.kind === "year") return `${result.period.start_date.slice(0, 4)}년`;
  return `${result.period.start_date} ~ ${result.period.end_date}`;
}

export function DefectStatisticsView({
  departmentOptions,
  modelOptions,
  currentDepartment,
  onBack,
}: Props) {
  const [period, setPeriod] = useState<DefectStatisticsPeriodKind>("week");
  const [anchor, setAnchor] = useState(todayInKst);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedProcessSteps, setSelectedProcessSteps] = useState<DefectProcessStep[]>([]);
  const [historicalDepartments, setHistoricalDepartments] = useState<string[]>([]);
  const [result, setResult] = useState<DefectStatisticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void defectsApi.getStatistics({
      period,
      anchor,
      departments: selectedDepartments,
      models: selectedModels,
      process_steps: selectedProcessSteps,
    }).then((next) => {
      if (active) {
        setResult(next);
        setHistoricalDepartments((current) => Array.from(new Set([
          ...current,
          ...next.departments.map((entry) => entry.label),
        ])));
      }
    }).catch((reason: unknown) => {
      if (!active) return;
      setError(reason instanceof Error ? reason.message : "불량 통계를 불러오지 못했습니다.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [period, anchor, selectedDepartments, selectedModels, selectedProcessSteps, retryNonce]);

  const kpis = useMemo(() => [
    { label: "불량 건수", value: result ? `${result.summary.record_count}건` : "-", tone: LEGACY_COLORS.red },
    { label: "불량 수량", value: result ? `${formatQty(result.summary.quantity)}개` : "-", tone: LEGACY_COLORS.red },
    { label: "최다 발생 품목", value: result?.summary.top_item?.label ?? "없음", tone: LEGACY_COLORS.blue },
    { label: "최다 불량 사유", value: result?.summary.top_reason?.label ?? "없음", tone: LEGACY_COLORS.yellow },
  ], [result]);
  const availableDepartmentOptions = useMemo(
    () => Array.from(new Set([...departmentOptions, ...historicalDepartments])).sort(),
    [departmentOptions, historicalDepartments],
  );

  function resetCategories() {
    setSelectedDepartments([]);
    setSelectedModels([]);
    setSelectedProcessSteps([]);
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header
        className="flex flex-col gap-4 rounded-[20px] border px-4 py-3 xl:flex-row xl:items-center xl:justify-between"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="standard-hover flex min-h-11 shrink-0 items-center gap-2 rounded-[12px] border px-3 text-sm font-bold"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
          >
            <ArrowLeft className="h-4 w-4" />
            작업 선택
          </button>
          <div className="min-w-0">
            <h2 className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>불량 통계</h2>
          </div>
        </div>

        <div role="group" aria-label="조회 기간" className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex rounded-[12px] border p-1" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            {(Object.keys(PERIOD_LABELS) as DefectStatisticsPeriodKind[]).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={period === value}
                onClick={() => setPeriod(value)}
                className="min-h-11 flex-1 rounded-[9px] px-4 text-sm font-black transition-colors sm:flex-none"
                style={{
                  background: period === value ? tint(LEGACY_COLORS.blue, 14) : "transparent",
                  color: period === value ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
                }}
              >
                {PERIOD_LABELS[value]}
              </button>
            ))}
          </div>
          <div className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)_44px] items-center rounded-[12px] border p-1 sm:min-w-[320px]" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            <button
              type="button"
              aria-label="이전 기간"
              onClick={() => setAnchor((current) => shiftStatisticsAnchor(current, period, -1))}
              className="standard-hover flex h-11 w-11 shrink-0 items-center justify-center rounded-[9px]"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <p aria-live="polite" className="px-2 text-center text-sm font-bold tabular-nums" style={{ color: LEGACY_COLORS.text }}>
              {result ? periodDisplay(result) : "기간 불러오는 중…"}
            </p>
            <button
              type="button"
              aria-label="다음 기간"
              onClick={() => setAnchor((current) => shiftStatisticsAnchor(current, period, 1))}
              className="standard-hover flex h-11 w-11 shrink-0 items-center justify-center rounded-[9px]"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setAnchor(todayInKst())}
            className="standard-hover min-h-11 shrink-0 rounded-[12px] px-3 text-sm font-bold"
            style={{ color: LEGACY_COLORS.blue }}
          >
            현재 기간
          </button>
        </div>
      </header>

      <DefectCategoryFilters
        departments={availableDepartmentOptions}
        models={modelOptions}
        currentDept={currentDepartment}
        showMyDepartment={false}
        selectedDepartments={selectedDepartments}
        selectedModels={selectedModels}
        selectedProcessSteps={selectedProcessSteps}
        onDepartmentsChange={setSelectedDepartments}
        onModelsChange={setSelectedModels}
        onProcessStepsChange={setSelectedProcessSteps}
        onResetCategoryFilters={resetCategories}
      />

      {loading && !result ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-[20px] border text-sm font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
          불량 통계 불러오는 중...
        </div>
      ) : error ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[20px] border px-4 text-center" style={{ background: tint(LEGACY_COLORS.red, 5), borderColor: tint(LEGACY_COLORS.red, 28) }}>
          <p className="text-sm font-bold" style={{ color: LEGACY_COLORS.red }}>{error}</p>
          <button type="button" onClick={() => setRetryNonce((value) => value + 1)} className="standard-hover min-h-11 rounded-[12px] border px-4 text-sm font-black" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.blue }}>
            다시 시도
          </button>
        </div>
      ) : result ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((kpi) => (
              <article key={kpi.label} className="rounded-[20px] border px-5 py-4" style={{ background: tint(kpi.tone, 7), borderColor: tint(kpi.tone, 25) }}>
                <p className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{kpi.label}</p>
                <p className="mt-2 break-words text-2xl font-black" style={{ color: kpi.tone }}>{kpi.value}</p>
              </article>
            ))}
          </div>

          {result.excluded_legacy_count > 0 && (
            <p className="rounded-[14px] border px-4 py-3 text-sm font-bold" style={{ background: tint(LEGACY_COLORS.yellow, 8), borderColor: tint(LEGACY_COLORS.yellow, 28), color: LEGACY_COLORS.muted2 }}>
              발생 시각을 신뢰할 수 없는 레거시 합산 기록 {result.excluded_legacy_count}건은 통계에서 제외했습니다.
            </p>
          )}

          <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] xl:grid-rows-[repeat(3,340px)]">
            <section className="h-[340px] min-w-0 rounded-[20px] border p-5 xl:col-start-1" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
              <h3 className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>기간별 불량 추이</h3>
              {result.summary.record_count === 0 ? (
                <div className="flex h-[250px] items-center justify-center text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>선택한 기간에 불량 발생 기록이 없습니다.</div>
              ) : (
                <div className="mt-4 h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={result.timeline} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid stroke={LEGACY_COLORS.border} vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: LEGACY_COLORS.muted2, fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: LEGACY_COLORS.muted2, fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, borderRadius: 12 }} />
                      <Bar dataKey="quantity" name="불량 수량" fill={LEGACY_COLORS.red} radius={[8, 8, 2, 2]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <BreakdownPanel title="사유별 집계" entries={result.reasons} />
            <BreakdownPanel title="부서별 집계" entries={result.departments} />
            <BreakdownPanel title="품목별 순위" entries={result.items} showCode />
          </div>
        </>
      ) : null}
    </div>
  );
}

function BreakdownPanel({
  title,
  entries,
  showCode = false,
}: {
  title: string;
  entries: Array<DefectStatisticsBreakdown & { mes_code?: string | null }>;
  showCode?: boolean;
}) {
  return (
    <section className={`flex h-[340px] min-h-0 min-w-0 flex-col rounded-[20px] border p-5 ${showCode ? "xl:col-start-2 xl:row-start-1 xl:row-span-3 xl:h-auto" : "xl:col-start-1"}`} style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
      <h3 className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>{title}</h3>
      {entries.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-center text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>집계 결과가 없습니다.</p>
      ) : (
        // 카드의 고정 프레임은 유지하고, 여백(20px)·테두리(1px) 밖으로 레일만 분리한다.
        <div className="relative mt-3 min-h-0 flex-1 lg:-mx-[21px]">
          <div
            role="region"
            aria-label={`${title} 스크롤 영역`}
            tabIndex={0}
            data-keep-scroll
            className="absolute inset-y-0 left-0 right-0 overflow-y-auto overscroll-y-auto lg:-right-2.5 lg:[scrollbar-gutter:stable]"
          >
            <div className="min-h-full lg:px-[21px]">
              <ol
                aria-label={`${title} 목록`}
                className="divide-y pr-2"
                style={{ borderColor: LEGACY_COLORS.border }}
              >
                {entries.map((entry, index) => (
                  <li key={entry.key} className="flex min-h-11 items-center gap-3 py-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black" style={{ background: tint(LEGACY_COLORS.blue, 10), color: LEGACY_COLORS.blue }}>{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-black" style={{ color: LEGACY_COLORS.text }}>{entry.label}</span>
                      {showCode && entry.mes_code && <span className="block text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{entry.mes_code}</span>}
                    </span>
                    <span className="shrink-0 text-sm font-black" style={{ color: LEGACY_COLORS.red }}>{entry.record_count}건 · {formatQty(entry.quantity)}개</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
