"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDesktopQueryState } from "../DesktopTabHome";
import { defectsApi } from "@/lib/api/defects";
import type { DefectStatisticsBreakdown, DefectStatisticsComparison, DefectStatisticsItemBreakdown, DefectStatisticsPeriodKind, DefectStatisticsReportResponse } from "@/lib/api/types/defects";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import { DefectCategoryFilters } from "./DefectCategoryFilters";
import type { DefectProcessStep } from "./DefectFilterBar";
import { EmptyState } from "../common/EmptyState";
import { SkeletonBlock } from "../common/LoadingSkeleton";
import { ReadFailure } from "../common/ReadState";

interface Props {
  mobilePresentation?: boolean;
  departmentOptions: string[];
  modelOptions: string[];
  currentDepartment: string;
  onBack: () => void;
}

const PERIOD_LABELS: Record<DefectStatisticsPeriodKind, string> = { week: "주간", month: "월간", year: "연간" };
const PROCESS_LABELS: Record<DefectProcessStep, string> = { R: "원자재", A: "중간공정", F: "공정완료", UNCLASSIFIED: "미분류", DISUSED: "불용" };

function todayInKst(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function shiftStatisticsAnchor(anchor: string, period: DefectStatisticsPeriodKind, direction: -1 | 1): string {
  const [year, month, day] = anchor.split("-").map(Number);
  let next: Date;
  if (period === "week") next = new Date(Date.UTC(year, month - 1, day + 7 * direction));
  else if (period === "month") {
    const targetMonth = year * 12 + month - 1 + direction;
    const targetYear = Math.floor(targetMonth / 12);
    const monthIndex = ((targetMonth % 12) + 12) % 12;
    next = new Date(Date.UTC(targetYear, monthIndex, Math.min(day, daysInUtcMonth(targetYear, monthIndex))));
  } else next = new Date(Date.UTC(year + direction, month - 1, Math.min(day, daysInUtcMonth(year + direction, month - 1))));
  return next.toISOString().slice(0, 10);
}

function periodIdentity(anchor: string, period: DefectStatisticsPeriodKind): string {
  if (period === "year") return anchor.slice(0, 4);
  if (period === "month") return anchor.slice(0, 7);
  const date = new Date(`${anchor}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}

function periodDisplay(result: DefectStatisticsReportResponse | null, anchor: string, period: DefectStatisticsPeriodKind): string {
  if (!result) return period === "year" ? `${anchor.slice(0, 4)}년` : period === "month" ? `${anchor.slice(0, 7)}월` : `${periodIdentity(anchor, period)} 주`;
  if (period === "year") return `${result.period.start_date.slice(0, 4)}년`;
  if (period === "month") return `${result.period.start_date.slice(0, 7)}월`;
  return `${result.period.start_date} ~ ${result.period.end_date}`;
}

function signedQty(value: number): string { return `${value > 0 ? "+" : ""}${formatQty(value)}개`; }
function share(value: number, total: number): string { return `${total > 0 ? Math.round(value / total * 100) : 0}%`; }
function asOfLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function comparisonBasis(comparison: DefectStatisticsComparison, isPartial: boolean): string {
  if (!isPartial) return `${comparison.period.start_date} ~ ${comparison.period.end_date} 전체 비교`;
  return `${comparison.period.start_date} ~ ${asOfLabel(comparison.observed_until)} 미만 · ${comparison.range_adjusted ? "기간 보정 비교" : "같은 시각까지 비교"}`;
}

function useStatisticsQueryState<T>(key: string, initial: T | (() => T), mobile: boolean): ReturnType<typeof useDesktopQueryState<T>> {
  const [value, setValue] = useDesktopQueryState<T>(key, () => {
    const fallback = typeof initial === "function" ? (initial as () => T)() : initial;
    if (!mobile || typeof window === "undefined") return fallback;
    try {
      const saved = window.sessionStorage.getItem(`mes-${key}`);
      return saved === null ? fallback : JSON.parse(saved) as T;
    } catch { return fallback; }
  });
  useEffect(() => {
    if (!mobile) return;
    try {
      if (value === undefined) window.sessionStorage.removeItem(`mes-${key}`);
      else window.sessionStorage.setItem(`mes-${key}`, JSON.stringify(value));
    } catch { /* Storage may be unavailable in a private browser context. */ }
  }, [key, mobile, value]);
  return [value, setValue];
}

function Card({ label, value, detail, note, tone }: { label: string; value: string; detail: string; note?: string; tone: string }) {
  return <article className="min-w-0 rounded-[20px] border px-4 py-3" style={{ background: tint(tone, 7), borderColor: tint(tone, 25) }}>
    <p className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{label}</p>
    <p className="mt-1 break-words text-2xl font-black leading-tight" style={{ color: tone }}>{value}</p>
    <p className="mt-1 break-words text-sm font-medium" style={{ color: LEGACY_COLORS.muted2 }}>{detail}</p>
    {note && <p className="mt-1 break-words text-xs font-medium" style={{ color: LEGACY_COLORS.muted2 }}>{note}</p>}
  </article>;
}

function BreakdownPanel({ title, entries, total, onSelect, selected }: { title: string; entries: DefectStatisticsBreakdown[]; total: number; onSelect: (key: string) => void; selected?: string }) {
  return <section className="flex h-[255px] min-h-0 min-w-0 flex-col rounded-[20px] border p-4" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
    <div className="flex min-h-11 shrink-0 items-center justify-between gap-2"><h3 className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>{title}</h3><span className="text-xs font-medium" style={{ color: LEGACY_COLORS.muted2 }}>전체 수량 = 100%</span></div>
    {entries.length === 0 ? <EmptyState compact className="flex-1" title="집계 결과가 없습니다." description="" /> :
      <div className="relative -mx-4 mt-2 min-h-0 flex-1">
      <div role="region" aria-label={`${title} 스크롤 영역`} tabIndex={0} data-keep-scroll className="absolute inset-y-0 left-0 right-0 overflow-y-auto overscroll-y-auto lg:-right-2.5 lg:[scrollbar-gutter:stable]">
        <div className="min-h-full min-w-full px-4">
        <ol aria-label={`${title} 목록`} className="space-y-1">{entries.map((entry) => <li key={entry.key}>
          <button type="button" aria-label={`${title === "사유별 집계" ? "사유" : "부서"} ${entry.label} 선택`} aria-pressed={selected === entry.key} onClick={() => onSelect(entry.key)} className="standard-hover min-h-11 w-full rounded-[12px] px-2 py-1 text-left focus-visible:ring-2" style={{ background: selected === entry.key ? tint(LEGACY_COLORS.blue, 10) : "transparent", color: LEGACY_COLORS.text }}>
            <span className="flex justify-between gap-2 text-sm font-bold"><span className="min-w-0 break-words">{entry.label}</span><span className="shrink-0 tabular-nums">{formatQty(entry.quantity)}개 · {share(entry.quantity, total)} · {entry.record_count}건</span></span>
            <span className="mt-1 block h-1.5 rounded-full" style={{ background: tint(LEGACY_COLORS.blue, 10) }}><span className="block h-full rounded-full" style={{ width: `${total > 0 ? entry.quantity / total * 100 : 0}%`, background: LEGACY_COLORS.blue }} /></span>
          </button>
        </li>)}</ol>
        </div>
      </div>
      </div>}
  </section>;
}

function ItemComparison({ result, selected, onSelect }: { result: DefectStatisticsReportResponse; selected?: string; onSelect: (itemId: string) => void }) {
  const previous = new Map(result.comparison?.items.map((entry) => [entry.item_id, entry]) ?? []);
  const current = new Map(result.items.map((entry) => [entry.item_id, entry]));
  const items: DefectStatisticsItemBreakdown[] = [...result.items, ...(result.comparison?.items.filter((entry) => !current.has(entry.item_id)) ?? [])];
  return <section className="flex h-[255px] min-h-0 min-w-0 flex-col rounded-[20px] border p-4" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
    <h3 className="flex min-h-11 shrink-0 items-center text-base font-black" style={{ color: LEGACY_COLORS.text }}>품목 비교</h3>
    {items.length === 0 ? <EmptyState compact className="flex-1" title="집계 결과가 없습니다." description="" /> :
      <div className="relative -mx-4 mt-2 min-h-0 flex-1">
      <div role="region" aria-label="품목 비교 스크롤 영역" tabIndex={0} data-keep-scroll className="absolute inset-y-0 left-0 right-0 overflow-y-auto overscroll-y-auto lg:-right-2.5 lg:[scrollbar-gutter:stable]">
        <div className="min-h-full min-w-full px-4">
        <table className="w-full table-fixed text-left text-sm" style={{ color: LEGACY_COLORS.text }}><thead className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}><tr>
          <th className="w-[34%] py-2 lg:w-[46%]">품목</th><th className="w-[14%] pl-1 text-right lg:pl-2">현재 수량</th><th className="w-[12%] pl-1 text-right lg:w-[10%] lg:pl-2">건수</th><th className="w-[12%] pl-1 text-right lg:w-[10%] lg:pl-2">비중</th><th className="w-[28%] pl-1 text-right lg:w-[20%] lg:pl-2">이전 수량 · 증감</th>
        </tr></thead><tbody>{items.map((entry) => {
          const now = current.get(entry.item_id);
          const before = previous.get(entry.item_id);
          const delta = (now?.quantity ?? 0) - (before?.quantity ?? 0);
          return <tr key={entry.item_id} className="border-t" style={{ borderColor: LEGACY_COLORS.border }}>
            <td className="py-1 pr-1"><button type="button" aria-label={`품목 ${entry.label} 선택`} aria-pressed={selected === entry.item_id} onClick={() => onSelect(entry.item_id)} className="standard-hover min-h-11 w-full break-words rounded-[10px] text-left font-bold focus-visible:ring-2" style={{ color: LEGACY_COLORS.blue }}>{entry.label}<span className="block text-xs font-medium" style={{ color: LEGACY_COLORS.muted2 }}>{entry.mes_code}</span></button></td>
            <td className="break-words pl-1 text-right tabular-nums lg:pl-2">{formatQty(now?.quantity ?? 0)}개</td><td className="pl-1 text-right tabular-nums lg:pl-2">{now?.record_count ?? 0}건</td><td className="pl-1 text-right tabular-nums lg:pl-2">{share(now?.quantity ?? 0, result.summary.quantity)}</td>
            <td className="break-words pl-1 text-right tabular-nums lg:pl-2">{formatQty(before?.quantity ?? 0)}개 <span style={{ color: delta > 0 ? LEGACY_COLORS.red : LEGACY_COLORS.green }}>({signedQty(delta)})</span></td>
          </tr>;
        })}</tbody></table>
        </div>
      </div>
      </div>}
  </section>;
}

export function DefectStatisticsView({ departmentOptions, modelOptions, currentDepartment, onBack, mobilePresentation = false }: Props) {
  const [period, setPeriod] = useStatisticsQueryState<DefectStatisticsPeriodKind>("defect-statistics-period", "month", mobilePresentation);
  const [anchor, setAnchor] = useStatisticsQueryState("defect-statistics-date", todayInKst, mobilePresentation);
  const [selectedDepartments, setSelectedDepartments] = useStatisticsQueryState<string[]>("defect-statistics-departments", [], mobilePresentation);
  const [selectedModels, setSelectedModels] = useStatisticsQueryState<string[]>("defect-statistics-models", [], mobilePresentation);
  const [selectedProcessSteps, setSelectedProcessSteps] = useStatisticsQueryState<DefectProcessStep[]>("defect-statistics-processes", [], mobilePresentation);
  const [reason, setReason] = useStatisticsQueryState<string | undefined>("defect-statistics-reason", undefined, mobilePresentation);
  const [itemId, setItemId] = useStatisticsQueryState<string | undefined>("defect-statistics-item", undefined, mobilePresentation);
  const [itemLabel, setItemLabel] = useStatisticsQueryState<string | undefined>("defect-statistics-item-label", undefined, mobilePresentation);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailTrend, setDetailTrend] = useState(false);
  const [historicalDepartments, setHistoricalDepartments] = useState<string[]>([]);
  const [stored, setStored] = useState<{ key: string; value: DefectStatisticsReportResponse } | null>(null);
  const [errorState, setErrorState] = useState<{ key: string; message: string } | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const today = todayInKst();
  const queryAnchor = periodIdentity(anchor, period) > periodIdentity(today, period) ? today : anchor;
  const key = JSON.stringify([period, queryAnchor, selectedDepartments, selectedModels, selectedProcessSteps, reason, itemId, retryNonce]);
  const result = stored?.key === key ? stored.value : null;
  const error = errorState?.key === key ? errorState.message : null;
  const nextDisabled = periodIdentity(shiftStatisticsAnchor(queryAnchor, period, 1), period) > periodIdentity(today, period);
  const categoryCount = selectedDepartments.length + selectedModels.length + selectedProcessSteps.length;
  const availableDepartments = useMemo(() => Array.from(new Set([...departmentOptions, ...historicalDepartments])), [departmentOptions, historicalDepartments]);

  useLayoutEffect(() => {
    setStored(null);
    setErrorState(null);
  }, [key]);

  useLayoutEffect(() => {
    if (anchor !== queryAnchor) setAnchor(queryAnchor);
  }, [anchor, queryAnchor, setAnchor]);

  useEffect(() => {
    let active = true;
    void defectsApi.getStatisticsReport({ period, anchor: queryAnchor, departments: selectedDepartments, models: selectedModels, process_steps: selectedProcessSteps, reason, item_id: itemId }).then((value) => {
      if (!active) return;
      setErrorState(null);
      setStored({ key, value });
      setHistoricalDepartments((current) => Array.from(new Set([...current, ...value.departments.map((entry) => entry.label), ...(value.comparison?.departments.map((entry) => entry.label) ?? [])])));
    }).catch((failure: unknown) => {
      if (active) setErrorState({ key, message: failure instanceof Error ? failure.message : "불량 통계를 불러오지 못했습니다." });
    });
    return () => { active = false; };
  }, [key, period, queryAnchor, selectedDepartments, selectedModels, selectedProcessSteps, reason, itemId]);

  function resetFilters(): void { setSelectedDepartments([]); setSelectedModels([]); setSelectedProcessSteps([]); setReason(undefined); setItemId(undefined); setItemLabel(undefined); }
  function refresh(): void { setRetryNonce((value) => value + 1); }
  function selectReason(value: string): void { setReason((current) => current === value ? undefined : value); }
  function selectDepartment(value: string): void { setSelectedDepartments((current) => current.length === 1 && current[0] === value ? [] : [value]); }
  function selectItem(value: string): void {
    const selected = itemId === value ? undefined : value;
    setItemId(selected);
    setItemLabel(selected ? [...(result?.items ?? []), ...(result?.comparison?.items ?? [])].find((entry) => entry.item_id === selected)?.label : undefined);
  }

  const topReasonQty = result ? Math.max(0, ...result.reasons.map((entry) => entry.quantity)) : 0;
  const topReasons = result?.reasons.filter((entry) => entry.quantity === topReasonQty) ?? [];
  const topItems = result?.items.slice(0, 3) ?? [];
  const topItemsQuantity = topItems.reduce((total, entry) => total + entry.quantity, 0);
  const comparison = result?.comparison;
  const futureResult = result?.observed_until === null;
  const trend = result ? detailTrend ? result.timeline : result.trend.filter((entry) => entry.start_date <= today).map((entry) => ({ ...entry, label: entry.is_partial ? `${entry.label} · 집계 중` : entry.label })) : [];

  return <div className="flex min-w-0 flex-col gap-3">
    <header className="flex min-w-0 flex-col gap-2 rounded-[20px] border px-4 py-3 lg:flex-row lg:items-center lg:justify-between" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
      <div className="flex min-w-0 items-center gap-2"><button type="button" onClick={onBack} className="standard-hover flex min-h-11 shrink-0 items-center gap-1 rounded-[12px] border px-3 text-sm font-bold" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}><ArrowLeft className="h-4 w-4" />작업 선택</button><div className="min-w-0"><h2 className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>불량 통계</h2><p className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>현재 분류 기준 · B급·구형 제외</p></div></div>
      <div className="flex min-w-0 flex-wrap items-center gap-2"><div role="group" aria-label="조회 기간" className="flex min-w-0 flex-wrap items-center gap-1">
        {(Object.keys(PERIOD_LABELS) as DefectStatisticsPeriodKind[]).map((value) => <button key={value} type="button" aria-pressed={period === value} onClick={() => { setAnchor(periodIdentity(queryAnchor, value) > periodIdentity(today, value) ? today : queryAnchor); setPeriod(value); setDetailTrend(false); }} className="min-h-11 rounded-[10px] px-2 text-sm font-bold focus-visible:ring-2" style={{ background: period === value ? tint(LEGACY_COLORS.blue, 14) : LEGACY_COLORS.s2, color: period === value ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2 }}>{PERIOD_LABELS[value]}</button>)}
        <button type="button" aria-label="이전 기간" onClick={() => setAnchor(shiftStatisticsAnchor(queryAnchor, period, -1))} className="standard-hover flex h-11 w-11 items-center justify-center rounded-[10px] focus-visible:ring-2" style={{ color: LEGACY_COLORS.muted2 }}><ChevronLeft className="h-5 w-5" /></button>
        <p aria-live="polite" className="min-w-[110px] text-center text-sm font-bold tabular-nums" style={{ color: LEGACY_COLORS.text }}>{periodDisplay(result, queryAnchor, period)}</p>
        <button type="button" aria-label="다음 기간" disabled={nextDisabled} onClick={() => setAnchor(shiftStatisticsAnchor(queryAnchor, period, 1))} className="standard-hover flex h-11 w-11 items-center justify-center rounded-[10px] disabled:opacity-40 focus-visible:ring-2" style={{ color: LEGACY_COLORS.muted2 }}><ChevronRight className="h-5 w-5" /></button>
        <button type="button" onClick={() => setAnchor(todayInKst())} className="standard-hover min-h-11 rounded-[10px] px-2 text-sm font-bold focus-visible:ring-2" style={{ color: LEGACY_COLORS.blue }}>현재 기간</button>
      </div>{result && <p className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>조회 {asOfLabel(result.as_of)} KST</p>}<button type="button" aria-label="새로고침" onClick={refresh} className="standard-hover flex h-11 w-11 items-center justify-center rounded-[10px] focus-visible:ring-2" style={{ color: LEGACY_COLORS.blue }}><RefreshCw className="h-4 w-4" /></button></div>
    </header>

    <section className="min-w-0 rounded-[20px] border px-3 py-2" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}><div className="flex flex-wrap items-center gap-2">
      <button type="button" aria-label="분류 조건 펼치기" aria-expanded={filtersOpen} aria-controls="statistics-category-filters" onClick={() => setFiltersOpen((value) => !value)} className="standard-hover flex min-h-11 items-center gap-1 rounded-[12px] px-2 text-sm font-bold focus-visible:ring-2" style={{ color: LEGACY_COLORS.blue }}>분류 조건 <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} /></button>
      <span className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>{categoryCount ? `${categoryCount}개 조건 선택` : "전체 부서 · 전체 모델 · 전체 공정"}</span>
      {selectedDepartments.map((value) => <button key={value} type="button" onClick={() => setSelectedDepartments((current) => current.filter((entry) => entry !== value))} className="min-h-11 rounded-full px-3 text-xs font-bold focus-visible:ring-2" style={{ background: tint(LEGACY_COLORS.green, 12), color: LEGACY_COLORS.green }}>부서 {value} ×</button>)}
      {selectedModels.map((value) => <button key={value} type="button" onClick={() => setSelectedModels((current) => current.filter((entry) => entry !== value))} className="min-h-11 rounded-full px-3 text-xs font-bold focus-visible:ring-2" style={{ background: tint(LEGACY_COLORS.cyan, 12), color: LEGACY_COLORS.cyan }}>모델 {value} ×</button>)}
      {selectedProcessSteps.map((value) => <button key={value} type="button" onClick={() => setSelectedProcessSteps((current) => current.filter((entry) => entry !== value))} className="min-h-11 rounded-full px-3 text-xs font-bold focus-visible:ring-2" style={{ background: tint(LEGACY_COLORS.yellow, 12), color: LEGACY_COLORS.yellow }}>공정 {PROCESS_LABELS[value]} ×</button>)}
      {reason && <button type="button" onClick={() => setReason(undefined)} className="min-h-11 rounded-full px-3 text-xs font-bold focus-visible:ring-2" style={{ background: tint(LEGACY_COLORS.blue, 12), color: LEGACY_COLORS.blue }}>사유 {reason} ×</button>}
      {itemId && <button type="button" aria-label={`선택 품목 ${itemLabel ?? itemId} 해제`} onClick={() => { setItemId(undefined); setItemLabel(undefined); }} className="min-h-11 rounded-full px-3 text-xs font-bold focus-visible:ring-2" style={{ background: tint(LEGACY_COLORS.blue, 12), color: LEGACY_COLORS.blue }}>품목 {itemLabel ?? itemId} ×</button>}
      {(categoryCount > 0 || reason || itemId) && <button type="button" onClick={resetFilters} className="standard-hover min-h-11 rounded-[10px] px-2 text-sm font-bold focus-visible:ring-2" style={{ color: LEGACY_COLORS.blue }}>전체 초기화</button>}
      {result && !error && !futureResult && <p className="min-w-0 basis-full break-words text-sm font-medium lg:ml-auto lg:basis-auto lg:flex-1 lg:text-right" style={{ color: LEGACY_COLORS.muted2 }}>{result.is_partial ? "현재까지" : "선택 기간"} 불량 {formatQty(result.summary.quantity)}개({result.summary.record_count}건). 최다 등록 사유는 {topReasons.length ? `${topReasons.map((entry) => entry.label).join(" · ")}(${topReasons.length > 1 ? "각 " : ""}${formatQty(topReasonQty)}개, 전체 ${share(topReasonQty, result.summary.quantity)})` : "없습니다"}. {comparison ? comparison.quantity_delta === 0 ? "이전 비교 기간과 수량이 같습니다." : `이전 비교 기간보다 ${formatQty(Math.abs(comparison.quantity_delta))}개 ${comparison.quantity_delta > 0 ? "많습니다" : "적습니다"}.` : "비교할 이전 기간이 없습니다."}</p>}
    </div><div id="statistics-category-filters" hidden={!filtersOpen}>{filtersOpen && <div className="mt-2"><DefectCategoryFilters departments={availableDepartments} models={modelOptions} currentDept={currentDepartment} showMyDepartment={false} selectedDepartments={selectedDepartments} selectedModels={selectedModels} selectedProcessSteps={selectedProcessSteps} onDepartmentsChange={setSelectedDepartments} onModelsChange={setSelectedModels} onProcessStepsChange={setSelectedProcessSteps} onResetCategoryFilters={resetFilters} /></div>}</div></section>

    {!result && !error ? <div role="status" aria-label="불량 통계 불러오는 중" aria-busy="true" className="space-y-3"><span className="sr-only">불량 통계 불러오는 중</span><div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((index) => <SkeletonBlock key={index} className="h-[100px] rounded-[20px]" />)}</div><div className="grid gap-3 lg:grid-cols-2">{[0, 1, 2, 3].map((index) => <div key={index} data-testid="statistics-panel-skeleton"><SkeletonBlock className="h-[255px] rounded-[20px]" /></div>)}</div></div>
      : error ? <div tabIndex={-1} ref={(node) => { node?.focus(); }}><ReadFailure message={error} onRetry={refresh} /></div>
      : futureResult ? <div role="status" className="rounded-[20px] border p-5 text-sm font-bold" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>미래 기간은 아직 집계하지 않았습니다.</div>
      : result && <>
        <div className="grid min-w-0 gap-3 lg:grid-cols-2 xl:grid-cols-4">
          <Card label="불량 발생 수량" value={`${formatQty(result.summary.quantity)}개`} detail={`${result.summary.record_count}건 등록`} tone={LEGACY_COLORS.red} />
          <Card label="이전 대비 수량" value={comparison ? signedQty(comparison.quantity_delta) : "비교 없음"} detail={comparison ? `${comparison.quantity_change_pct === null ? "비율 산출 불가" : `${comparison.quantity_change_pct > 0 ? "+" : ""}${Number(comparison.quantity_change_pct.toFixed(1))}%`} · 이전 ${formatQty(comparison.summary.quantity)}개` : "이전 기간 없음"} note={comparison ? `${comparisonBasis(comparison, result.is_partial)}${comparison.summary.quantity === 0 ? " · 이전 수량 0개로 비율을 표시하지 않습니다" : ""}` : undefined} tone={LEGACY_COLORS.yellow} />
          <Card label="최다 등록 사유" value={topReasons.length ? topReasons.map((entry) => entry.label).join(" · ") : "없음"} detail={topReasons.length ? `${formatQty(topReasonQty)}개 · 전체 ${share(topReasonQty, result.summary.quantity)}${topReasons.length > 1 ? " · 공동 1위" : ""}` : "등록된 사유 없음"} tone={LEGACY_COLORS.blue} />
          <Card label={`상위 ${topItems.length}개 품목 집중도`} value={share(topItemsQuantity, result.summary.quantity)} detail={`${formatQty(topItemsQuantity)}개 / 전체 ${formatQty(result.summary.quantity)}개`} tone={LEGACY_COLORS.green} />
        </div>
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          <section className="flex h-[255px] min-h-0 min-w-0 flex-col rounded-[20px] border p-4" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}><div className="flex shrink-0 items-center justify-between gap-2"><h3 className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>{detailTrend ? "선택 기간 상세" : "최근 추이"}</h3><button type="button" onClick={() => setDetailTrend((value) => !value)} className="standard-hover min-h-11 rounded-[10px] px-2 text-sm font-bold focus-visible:ring-2" style={{ color: LEGACY_COLORS.blue }}>{detailTrend ? "최근 추이 보기" : "선택 기간 상세"}</button></div><p className="shrink-0 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{detailTrend ? "선택 기간의 일별·월별 발생 수량" : period === "week" ? "최근 8주" : period === "month" ? "최근 6개월" : "최근 3년"}{!detailTrend && result.trend.some((entry) => entry.is_partial) ? " · 집계 중" : ""}</p>
            {trend.length === 0 ? <EmptyState compact className="min-h-0 flex-1" title="표시할 추이가 없습니다." description="" /> : <div className="mt-2 min-h-0 flex-1"><ResponsiveContainer width="100%" height="100%"><BarChart data={trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}><CartesianGrid stroke={LEGACY_COLORS.border} vertical={false} /><XAxis dataKey="label" tick={{ fill: LEGACY_COLORS.muted2, fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: LEGACY_COLORS.muted2, fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip contentStyle={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, borderRadius: 12 }} /><Bar dataKey="quantity" name="불량 수량" fill={LEGACY_COLORS.red} radius={[8, 8, 2, 2]} /></BarChart></ResponsiveContainer></div>}
          </section>
          <ItemComparison result={result} selected={itemId} onSelect={selectItem} />
          <BreakdownPanel title="부서별 집계" entries={result.departments} total={result.summary.quantity} onSelect={selectDepartment} selected={selectedDepartments.length === 1 ? selectedDepartments[0] : undefined} />
          <BreakdownPanel title="사유별 집계" entries={result.reasons} total={result.summary.quantity} onSelect={selectReason} selected={reason} />
        </div>
        <p className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>현재 관리 분류를 기준으로 집계하므로 분류를 바꾸면 과거 기간 결과도 달라집니다. B급·구형은 제외합니다. 발생 시각을 신뢰할 수 없는 레거시 합산 기록은 현재 {result.excluded_legacy_count}건{comparison ? `, 비교 기간 ${comparison.excluded_legacy_count}건` : ""} 제외했습니다.{comparison && ` 비교 기준: ${comparisonBasis(comparison, result.is_partial)}.`}</p>
      </>}
  </div>;
}
