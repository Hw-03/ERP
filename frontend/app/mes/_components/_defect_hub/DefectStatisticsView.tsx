"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode, type RefObject } from "react";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
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
import { Tooltip as LabelTooltip } from "@/lib/ui/Tooltip";
import { DefectFilterDisclosure } from "./DefectFilterDisclosure";
import styles from "./DefectStatisticsView.module.css";

interface Props {
  mobilePresentation?: boolean;
  departmentOptions: string[];
  modelOptions: string[];
  currentDepartment: string;
  onBack: () => void;
}

const PERIOD_LABELS: Record<DefectStatisticsPeriodKind, string> = { week: "주간", month: "월간", year: "연간" };
const PROCESS_LABELS: Record<DefectProcessStep, string> = { R: "원자재", A: "중간공정", F: "공정완료", UNCLASSIFIED: "미분류", DISUSED: "불용" };
const REASON_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATISTICS_PAGE_SIZE = 6;
const STATISTICS_CATEGORIES = [
  { key: "DEFECT", label: "불량", color: LEGACY_COLORS.red },
  { key: "B_GRADE", label: "B급", color: LEGACY_COLORS.yellow },
  { key: "OBSOLETE", label: "구형", color: LEGACY_COLORS.muted2 },
] as const;

/** 상단에서 현재 조회 결과의 원래 발생 분류를 함께 확인한다. */
function StatisticsCategoryCards({ totals }: { totals?: DefectStatisticsBreakdown[] }): ReactElement {
  return <div role="group" aria-label="발생 분류" className={styles.categories}>{STATISTICS_CATEGORIES.map(({ key, label, color }) => {
    const category = totals?.find((entry) => entry.key === key);
    return <article key={key} className={styles.category}>
      <span className={styles.categoryTitle}><span className={styles.categoryDot} style={{ background: color }} />{label}</span>
      <span className={styles.categoryValue}>{category ? formatQty(category.quantity) : "—"}<span>개</span></span>
      <span className={styles.secondary}>{category ? `${formatQty(category.record_count)}건 등록` : "조회 대기"}</span>
    </article>;
  })}</div>;
}

interface ListPresentationProps {
  mobilePresentation: boolean;
  page: number;
  onPageChange: (page: number) => void;
}

/** 당기 순서를 유지하고 전기에만 있는 품목을 뒤에 붙여 비교 대상을 보존한다. */
function comparisonItems(result: DefectStatisticsReportResponse): DefectStatisticsItemBreakdown[] {
  const currentIds = new Set(result.items.map((entry) => entry.item_id));
  return [...result.items, ...(result.comparison?.items.filter((entry) => !currentIds.has(entry.item_id)) ?? [])];
}

/** 성공 응답의 마지막 페이지를 계산하며, 빈 목록의 내부 페이지 상태는 1로 유지한다. */
function lastStatisticsPage(count: number): number {
  return Math.max(1, Math.ceil(count / STATISTICS_PAGE_SIZE));
}

/** PC는 외곽 스크롤만 사용하고 모바일은 기존 내부 목록 스크롤을 유지한다. */
function StatisticsListBody({ title, mobilePresentation, children }: { title: string; mobilePresentation: boolean; children: ReactNode }): ReactElement {
  if (!mobilePresentation) return <div className="mt-2 min-h-0 min-w-0 flex-1">{children}</div>;
  return <div className="relative -mx-4 mt-2 min-h-0 flex-1">
    <div role="region" aria-label={`${title} 스크롤 영역`} tabIndex={0} data-keep-scroll className="absolute inset-y-0 left-0 right-0 overflow-y-auto overscroll-y-auto lg:-right-2.5 lg:[scrollbar-gutter:stable]">
      <div className="min-h-full min-w-full px-4">{children}</div>
    </div>
  </div>;
}

/** 목록마다 독립된 접근성 이름과 페이지 이동을 제공한다. 빈 목록에는 표시하지 않는다. */
function StatisticsPagination({ title, count, page, onPageChange }: { title: string; count: number; page: number; onPageChange: (page: number) => void }): ReactElement | null {
  if (count === 0) return null;
  const lastPage = lastStatisticsPage(count);
  return <nav aria-label={`${title} 페이지`} className="mt-2 flex min-h-11 shrink-0 items-center justify-between gap-2 border-t" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
    <button type="button" aria-label={`${title} 이전 페이지`} disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="standard-hover flex min-h-11 items-center gap-1 rounded-[10px] px-2 text-sm font-bold disabled:opacity-40 focus-visible:ring-2"><ChevronLeft className="h-4 w-4" />이전</button>
    <span role="status" aria-label={`${title} 현재 페이지`} className="text-sm font-bold tabular-nums">{page} / {lastPage}</span>
    <button type="button" aria-label={`${title} 다음 페이지`} disabled={page >= lastPage} onClick={() => onPageChange(page + 1)} className="standard-hover flex min-h-11 items-center gap-1 rounded-[10px] px-2 text-sm font-bold disabled:opacity-40 focus-visible:ring-2">다음<ChevronRight className="h-4 w-4" /></button>
  </nav>;
}

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
  const start = result?.period.start_date ?? anchor;
  if (period === "year") return `${start.slice(0, 4)}년`;
  if (period === "month") return `${start.slice(0, 4)}년 ${Number(start.slice(5, 7))}월`;
  if (!result) return `${periodIdentity(anchor, period)} 주`;
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

/** 원래 발생 분류와 전기 값을 함께 확인하는 상세 표. */
function CategoryComparison({ result }: { result: DefectStatisticsReportResponse }): ReactElement {
  return <table aria-label="최초 발생 분류별 집계" className="w-full table-fixed text-xs tabular-nums" style={{ color: LEGACY_COLORS.text }}>
    <thead><tr className="text-right" style={{ color: LEGACY_COLORS.muted2 }}>
      <th scope="col" className="py-2 text-left">최초 분류</th><th scope="col">발생 수량</th><th scope="col">발생 건수</th><th scope="col">이전 수량</th><th scope="col">이전 건수</th>
    </tr></thead>
    <tbody>{result.categories.map((category) => {
      const previous = result.comparison?.categories.find((entry) => entry.key === category.key);
      return <tr key={category.key} className="border-t text-right" style={{ borderColor: LEGACY_COLORS.border }}>
        <th scope="row" className="py-2 text-left font-bold">{category.label}</th>
        <td>{formatQty(category.quantity)}개</td><td>{category.record_count}건</td>
        <td>{previous ? `${formatQty(previous.quantity)}개` : "—"}</td><td>{previous ? `${previous.record_count}건` : "—"}</td>
      </tr>;
    })}</tbody>
  </table>;
}

/** PC의 접힌 집계 기준과 모바일 안내에 동일한 집계 계약을 표시한다. */
function StatisticsNotes({ result }: { result: DefectStatisticsReportResponse }): ReactElement {
  const comparison = result.comparison;
  return <>
    <p>발생 시각의 원래 수량과 최초 발생 분류를 보존합니다. 이후 분류 변경·정상 복귀·폐기·반품으로 과거 발생량이 달라지지 않습니다. 현재 보관 잔량은 보관 화면에서 별도로 확인합니다.</p>
    <p>발생 시각을 신뢰할 수 없는 레거시 합산 기록은 현재 {result.excluded_legacy_count}건{comparison ? `, 비교 기간 ${comparison.excluded_legacy_count}건` : ""} 제외했습니다.</p>
    {comparison && <p>비교 기준: {comparisonBasis(comparison, result.is_partial)}.</p>}
    {(result.excluded_category_count > 0 || (comparison?.excluded_category_count ?? 0) > 0) && <p role="status" style={{ color: LEGACY_COLORS.yellow }}>최초 분류를 확인할 수 없는 기록은 현재 {result.excluded_category_count}건{comparison ? `, 비교 기간 ${comparison.excluded_category_count}건` : ""} 제외했습니다.</p>}
  </>;
}

/** PC에서는 발생량을 먼저 보여 주고 비교·집계 설명은 각각 펼쳐 확인한다. */
function StatisticsOverview({ result, loading, filterToggle, filterSelection }: { result: DefectStatisticsReportResponse | null; loading: boolean; filterToggle: ReactNode; filterSelection: ReactNode }): ReactElement {
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [basisOpen, setBasisOpen] = useState(false);
  const comparison = result?.comparison;
  const deltaTone = !comparison || comparison.quantity_delta === 0 ? LEGACY_COLORS.muted2 : comparison.quantity_delta > 0 ? LEGACY_COLORS.red : LEGACY_COLORS.green;
  const periodUnit = { week: "주", month: "달", year: "해" }[result?.period.kind ?? "month"];
  const hasExcluded = result && (result.excluded_legacy_count > 0 || result.excluded_category_count > 0 || (comparison?.excluded_legacy_count ?? 0) > 0 || (comparison?.excluded_category_count ?? 0) > 0);
  return <section className={styles.overview} aria-label="발생 현황">
    {result ? <div className={styles.overviewMain}>
      <article className={styles.total}>
        <p className={styles.eyebrow}>전체 등록 수량</p>
        <div className={styles.totalLine}><p className={styles.totalValue}>{formatQty(result.summary.quantity)}<span>개</span></p><span className={styles.secondary}>{result.summary.record_count}건 등록</span></div>
        {comparison ? <div className={styles.change}>
          <span style={{ color: deltaTone }} className={styles.delta}>{signedQty(comparison.quantity_delta)}{comparison.quantity_change_pct !== null && ` (${comparison.quantity_change_pct > 0 ? "+" : ""}${Number(comparison.quantity_change_pct.toFixed(1))}%)`}</span>
          <span className={styles.secondary}>이전 {periodUnit} {result.is_partial ? "같은 시점 " : ""}대비</span>
        </div> : <p className={styles.secondary}>비교 없음</p>}
      </article>
      <StatisticsCategoryCards totals={result.categories} />
    </div> : <div className={styles.overviewMain}>{loading ? <SkeletonBlock className="h-[160px]" /> : <div />}<StatisticsCategoryCards /></div>}
    <div className={styles.detailActions}>
      {hasExcluded && <span role="status" className={styles.exclusionNotice}>집계 제외 기록 있음</span>}
      {filterSelection}
      <div className={styles.detailButtons}>
        {comparison && <button type="button" aria-expanded={comparisonOpen} aria-controls="statistics-comparison" onClick={() => setComparisonOpen((value) => !value)}>이전 기간 상세<ChevronDown aria-hidden className={comparisonOpen ? styles.expanded : undefined} /></button>}
        {result && <button type="button" aria-expanded={basisOpen} aria-controls="statistics-basis" onClick={() => setBasisOpen((value) => !value)}>집계 기준<ChevronDown aria-hidden className={basisOpen ? styles.expanded : undefined} /></button>}
        {filterToggle}
      </div>
    </div>
    <div id="statistics-comparison" hidden={!comparisonOpen}>{comparisonOpen && result && <div className={styles.detailContent}><CategoryComparison result={result} /></div>}</div>
    <div id="statistics-basis" hidden={!basisOpen}>{basisOpen && result && <div className={`${styles.detailContent} ${styles.notes}`}>
      <p>조회 {asOfLabel(result.as_of)} KST</p>
      {comparison && <p>이전 기간 발생량 {formatQty(comparison.summary.quantity)}개 · {formatQty(comparison.summary.record_count)}건</p>}
      {comparison?.summary.quantity === 0 && <p>이전 수량 0개로 비율을 표시하지 않습니다.</p>}
      <StatisticsNotes result={result} />
    </div>}</div>
  </section>;
}

/** 품목·부서·사유 이름의 실제 잘림을 같은 기준으로 측정한다. */
function useStatisticsLabelOverflow(text: string, mobilePresentation: boolean): { labelRef: RefObject<HTMLSpanElement | null>; truncated: boolean } {
  const labelRef = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);
  useLayoutEffect(() => {
    const label = labelRef.current;
    if (!label || mobilePresentation) return;
    const measure = (): void => { setTruncated(label.scrollWidth > label.clientWidth || label.scrollHeight > label.clientHeight); };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(label);
    return () => observer.disconnect();
  }, [text, mobilePresentation]);
  return { labelRef, truncated };
}

function StatisticsBreakdownRow({ entry, total, onSelect, selected, mobilePresentation, scope, leaderLabel }: { entry: DefectStatisticsBreakdown; total: number; onSelect: (key: string) => void; selected: boolean; mobilePresentation: boolean; scope: "부서" | "사유"; leaderLabel?: string }): ReactElement {
  const { labelRef, truncated } = useStatisticsLabelOverflow(entry.label, mobilePresentation);
  return <LabelTooltip content={entry.label} disabled={mobilePresentation || !truncated} multiline triggerClassName="relative block min-w-0 w-full">
    <button type="button" aria-label={`${scope} ${entry.label} 선택`} aria-pressed={selected} onClick={() => onSelect(entry.key)} className={`standard-hover ${mobilePresentation ? "min-h-11" : styles.breakdownRow} w-full rounded-[12px] px-2 py-1 text-left focus-visible:ring-2`} style={{ background: selected ? tint(LEGACY_COLORS.blue, 10) : "transparent", color: LEGACY_COLORS.text }}>
      <span className={`flex justify-between gap-2 text-sm font-bold ${mobilePresentation ? "" : styles.breakdownLine}`}><span className="min-w-0 flex-1"><span ref={labelRef} className={mobilePresentation ? "break-words" : styles.entryLabel}>{entry.label}</span>{leaderLabel && <span className={styles.leader}>{leaderLabel}</span>}</span>{mobilePresentation ? <span className="shrink-0 tabular-nums">{formatQty(entry.quantity)}개 · {share(entry.quantity, total)} · {entry.record_count}건</span> : <span className={styles.breakdownValue}><span>{formatQty(entry.quantity)}개</span><span className={styles.secondary}>{share(entry.quantity, total)} · {formatQty(entry.record_count)}건</span></span>}</span>
      <span className="mt-1 block h-1.5 rounded-full" style={{ background: tint(LEGACY_COLORS.blue, 10) }}><span className="block h-full rounded-full" style={{ width: `${total > 0 ? entry.quantity / total * 100 : 0}%`, background: LEGACY_COLORS.blue }} /></span>
    </button>
  </LabelTooltip>;
}

function BreakdownPanel({ title, entries, total, onSelect, selected, mobilePresentation, page, onPageChange }: { title: string; entries: DefectStatisticsBreakdown[]; total: number; onSelect: (key: string) => void; selected?: string } & ListPresentationProps): ReactElement {
  const visibleEntries = mobilePresentation ? entries : entries.slice((page - 1) * STATISTICS_PAGE_SIZE, page * STATISTICS_PAGE_SIZE);
  const leaderQty = Math.max(0, ...entries.map((entry) => entry.quantity));
  const tiedLeaders = entries.filter((entry) => entry.quantity === leaderQty).length > 1;
  return <section className={`flex ${mobilePresentation ? "h-[255px]" : styles.panel} min-h-0 min-w-0 flex-col rounded-[20px] border p-4`} style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
    <div className={mobilePresentation ? "flex min-h-11 shrink-0 items-center justify-between gap-2" : styles.panelHeading}><h3 className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>{title}</h3>{mobilePresentation && <span className="text-xs font-medium" style={{ color: LEGACY_COLORS.muted2 }}>전체 수량 = 100%</span>}</div>
    {entries.length === 0 ? <EmptyState compact className="flex-1" title="집계 결과가 없습니다." description="" /> :
      <StatisticsListBody title={title} mobilePresentation={mobilePresentation}>
        <ol aria-label={`${title} 목록`} className="space-y-1">{visibleEntries.map((entry) => <li key={entry.key}>
          <StatisticsBreakdownRow entry={entry} total={total} onSelect={onSelect} selected={selected === entry.key} mobilePresentation={mobilePresentation} scope={title === "사유별 집계" ? "사유" : "부서"} leaderLabel={!mobilePresentation && title === "사유별 집계" && leaderQty > 0 && entry.quantity === leaderQty ? tiedLeaders ? "공동 1위" : "1위" : undefined} />
        </li>)}</ol>
      </StatisticsListBody>}
    {!mobilePresentation && <StatisticsPagination title={title} count={entries.length} page={page} onPageChange={onPageChange} />}
  </section>;
}

/** 두 줄 품목명이 실제로 잘렸을 때만 전체 이름을 보조 설명으로 제공한다. */
function StatisticsItemName({ entry, selected, onSelect, mobilePresentation }: { entry: DefectStatisticsItemBreakdown; selected: boolean; onSelect: (itemId: string) => void; mobilePresentation: boolean }): ReactElement {
  const { labelRef, truncated } = useStatisticsLabelOverflow(entry.label, mobilePresentation);
  return <LabelTooltip content={entry.label} disabled={mobilePresentation || !truncated} multiline triggerClassName="relative block min-w-0 w-full"><button type="button" aria-label={`품목 ${entry.label} 선택`} aria-pressed={selected} onClick={() => onSelect(entry.item_id)} className={`standard-hover min-h-11 w-full break-words rounded-[10px] text-left font-bold focus-visible:ring-2 ${mobilePresentation ? "" : styles.itemButton}`} style={{ color: LEGACY_COLORS.blue }}><span ref={labelRef} className={mobilePresentation ? undefined : styles.entryLabel}>{entry.label}</span><span className={`block font-medium ${mobilePresentation ? "text-xs" : styles.itemCode}`} style={{ color: LEGACY_COLORS.muted2 }}>{entry.mes_code}</span></button></LabelTooltip>;
}

function ItemComparison({ result, selected, onSelect, mobilePresentation, page, onPageChange }: { result: DefectStatisticsReportResponse; selected?: string; onSelect: (itemId: string) => void } & ListPresentationProps): ReactElement {
  const previous = new Map(result.comparison?.items.map((entry) => [entry.item_id, entry]) ?? []);
  const current = new Map(result.items.map((entry) => [entry.item_id, entry]));
  const items = comparisonItems(result);
  const visibleItems = mobilePresentation ? items : items.slice((page - 1) * STATISTICS_PAGE_SIZE, page * STATISTICS_PAGE_SIZE);
  const numericCell = mobilePresentation ? "break-words pl-1 text-right tabular-nums lg:pl-2" : styles.numericCell;
  const topItems = result.items.slice(0, 3);
  const topQuantity = topItems.reduce((sum, entry) => sum + entry.quantity, 0);
  return <section className={`flex ${mobilePresentation ? "h-[255px]" : `${styles.panel} ${styles.itemPanel}`} min-h-0 min-w-0 flex-col rounded-[20px] border p-4`} style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
    <div className={mobilePresentation ? undefined : styles.panelHeading}><h3 className="flex min-h-11 shrink-0 items-center text-base font-black" style={{ color: LEGACY_COLORS.text }}>품목 비교</h3>{!mobilePresentation && topItems.length > 0 && <span className={styles.concentration} aria-label={`상위 ${topItems.length}개 품목: ${formatQty(topQuantity)}개 / 전체 ${formatQty(result.summary.quantity)}개`}>상위 {topItems.length}개 품목 <strong>{share(topQuantity, result.summary.quantity)}</strong></span>}</div>
    {items.length === 0 ? <EmptyState compact className="flex-1" title="집계 결과가 없습니다." description="" /> :
      <StatisticsListBody title="품목 비교" mobilePresentation={mobilePresentation}>
        <table aria-label="품목 비교 목록" className={`w-full table-fixed text-left text-sm ${mobilePresentation ? "" : styles.itemTable}`} style={{ color: LEGACY_COLORS.text }}><thead className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}><tr className={mobilePresentation ? undefined : "h-9"}>
          <th className="w-[30%] py-2">품목</th><th className={mobilePresentation ? "w-[23%] pl-1 text-right lg:pl-2" : "w-[25%] pl-1 text-right"}>등록 수량</th><th className={mobilePresentation ? "w-[10%] pl-1 text-right lg:pl-2" : "w-[10%] pl-1 text-right"}>건수</th><th className={mobilePresentation ? "w-[12%] pl-1 text-right lg:pl-2" : "w-[10%] pl-1 text-right"}>비중</th><th className={mobilePresentation ? "w-[25%] pl-1 text-right lg:pl-2" : "w-[25%] pl-1 text-right"}>이전 수량 · 증감</th>
        </tr></thead><tbody>{visibleItems.map((entry) => {
          const now = current.get(entry.item_id);
          const before = previous.get(entry.item_id);
          const delta = (now?.quantity ?? 0) - (before?.quantity ?? 0);
          return <tr key={entry.item_id} className={`border-t ${mobilePresentation ? "" : "h-[62px]"}`} style={{ borderColor: LEGACY_COLORS.border }}>
            <td className="py-1 pr-1"><StatisticsItemName entry={entry} selected={selected === entry.item_id} onSelect={onSelect} mobilePresentation={mobilePresentation} /></td>
            <td className={numericCell}>{formatQty(now?.quantity ?? 0)}개</td><td className={numericCell}>{now?.record_count ?? 0}건</td><td className={`${numericCell} whitespace-nowrap`}>{share(now?.quantity ?? 0, result.summary.quantity)}</td>
            <td className={numericCell}>{formatQty(before?.quantity ?? 0)}개 <span className="block" style={{ color: delta > 0 ? LEGACY_COLORS.red : LEGACY_COLORS.green }}>({signedQty(delta)})</span></td>
          </tr>;
        })}</tbody></table>
      </StatisticsListBody>}
    {!mobilePresentation && <StatisticsPagination title="품목 비교" count={items.length} page={page} onPageChange={onPageChange} />}
  </section>;
}

export function DefectStatisticsView({ departmentOptions, modelOptions, currentDepartment, onBack, mobilePresentation = false }: Props) {
  const [period, setPeriod] = useStatisticsQueryState<DefectStatisticsPeriodKind>("defect-statistics-period", "month", mobilePresentation);
  const [anchor, setAnchor] = useStatisticsQueryState("defect-statistics-date", todayInKst, mobilePresentation);
  const [selectedDepartments, setSelectedDepartments] = useStatisticsQueryState<string[]>("defect-statistics-departments", [], mobilePresentation);
  const [selectedModels, setSelectedModels] = useStatisticsQueryState<string[]>("defect-statistics-models", [], mobilePresentation);
  const [selectedProcessSteps, setSelectedProcessSteps] = useStatisticsQueryState<DefectProcessStep[]>("defect-statistics-processes", [], mobilePresentation);
  const [reason, setReason] = useStatisticsQueryState<string | undefined>("defect-statistics-reason", undefined, mobilePresentation);
  const [savedReasonLabel, setReasonLabel] = useStatisticsQueryState<string | undefined>("defect-statistics-reason-label", undefined, mobilePresentation);
  const [itemId, setItemId] = useStatisticsQueryState<string | undefined>("defect-statistics-item", undefined, mobilePresentation);
  const [itemLabel, setItemLabel] = useStatisticsQueryState<string | undefined>("defect-statistics-item-label", undefined, mobilePresentation);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailTrend, setDetailTrend] = useState(false);
  const [historicalDepartments, setHistoricalDepartments] = useState<string[]>([]);
  const [stored, setStored] = useState<{ key: string; value: DefectStatisticsReportResponse } | null>(null);
  const [errorState, setErrorState] = useState<{ key: string; message: string } | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [pages, setPages] = useState({ items: 1, departments: 1, reasons: 1 });
  const today = todayInKst();
  const queryAnchor = periodIdentity(anchor, period) > periodIdentity(today, period) ? today : anchor;
  const conditionKey = JSON.stringify([period, queryAnchor, selectedDepartments, selectedModels, selectedProcessSteps, reason, itemId]);
  const key = JSON.stringify([conditionKey, retryNonce]);
  const result = stored?.key === key ? stored.value : null;
  const reasonLabel = result?.reasons.find((entry) => entry.key === reason)?.label ?? savedReasonLabel ?? reason;
  const error = errorState?.key === key ? errorState.message : null;
  const nextDisabled = periodIdentity(shiftStatisticsAnchor(queryAnchor, period, 1), period) > periodIdentity(today, period);
  const categoryCount = selectedDepartments.length + selectedModels.length + selectedProcessSteps.length;
  const availableDepartments = useMemo(() => Array.from(new Set([...departmentOptions, ...historicalDepartments])), [departmentOptions, historicalDepartments]);

  useLayoutEffect(() => {
    setStored(null);
    setErrorState(null);
  }, [key]);

  useLayoutEffect(() => {
    setPages({ items: 1, departments: 1, reasons: 1 });
  }, [conditionKey]);

  useLayoutEffect(() => {
    if (anchor !== queryAnchor) setAnchor(queryAnchor);
  }, [anchor, queryAnchor, setAnchor]);

  useEffect(() => {
    let active = true;
    void defectsApi.getStatisticsReport({ period, anchor: queryAnchor, departments: selectedDepartments, models: selectedModels, process_steps: selectedProcessSteps,
      reason: reason && REASON_ID_PATTERN.test(reason) ? undefined : reason,
      reason_category_id: reason && REASON_ID_PATTERN.test(reason) ? reason : undefined, item_id: itemId }).then((value) => {
      if (!active) return;
      setErrorState(null);
      setStored({ key, value });
      setPages((current) => ({
        items: Math.min(current.items, lastStatisticsPage(comparisonItems(value).length)),
        departments: Math.min(current.departments, lastStatisticsPage(value.departments.length)),
        reasons: Math.min(current.reasons, lastStatisticsPage(value.reasons.length)),
      }));
      setHistoricalDepartments((current) => Array.from(new Set([...current, ...value.departments.map((entry) => entry.label), ...(value.comparison?.departments.map((entry) => entry.label) ?? [])])));
    }).catch((failure: unknown) => {
      if (active) setErrorState({ key, message: failure instanceof Error ? failure.message : "불량 통계를 불러오지 못했습니다." });
    });
    return () => { active = false; };
  }, [key, period, queryAnchor, selectedDepartments, selectedModels, selectedProcessSteps, reason, itemId]);

  function resetFilters(): void { setSelectedDepartments([]); setSelectedModels([]); setSelectedProcessSteps([]); setReason(undefined); setReasonLabel(undefined); setItemId(undefined); setItemLabel(undefined); }
  function refresh(): void { setRetryNonce((value) => value + 1); }
  function selectReason(value: string): void {
    const selected = reason === value ? undefined : value;
    setReason(selected);
    setReasonLabel(selected ? result?.reasons.find((entry) => entry.key === selected)?.label : undefined);
  }
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

  const filterChips = <>
      {selectedDepartments.map((value) => <button key={value} type="button" onClick={() => setSelectedDepartments((current) => current.filter((entry) => entry !== value))} className="min-h-11 rounded-full px-3 text-xs font-bold focus-visible:ring-2" style={{ background: tint(LEGACY_COLORS.green, 12), color: LEGACY_COLORS.green }}>부서 {value} ×</button>)}
      {selectedModels.map((value) => <button key={value} type="button" onClick={() => setSelectedModels((current) => current.filter((entry) => entry !== value))} className="min-h-11 rounded-full px-3 text-xs font-bold focus-visible:ring-2" style={{ background: tint(LEGACY_COLORS.cyan, 12), color: LEGACY_COLORS.cyan }}>모델 {value} ×</button>)}
      {selectedProcessSteps.map((value) => <button key={value} type="button" onClick={() => setSelectedProcessSteps((current) => current.filter((entry) => entry !== value))} className="min-h-11 rounded-full px-3 text-xs font-bold focus-visible:ring-2" style={{ background: tint(LEGACY_COLORS.yellow, 12), color: LEGACY_COLORS.yellow }}>공정 {PROCESS_LABELS[value]} ×</button>)}
      {reason && <button type="button" onClick={() => { setReason(undefined); setReasonLabel(undefined); }} className="min-h-11 rounded-full px-3 text-xs font-bold focus-visible:ring-2" style={{ background: tint(LEGACY_COLORS.blue, 12), color: LEGACY_COLORS.blue }}>사유 {reasonLabel} ×</button>}
      {itemId && <button type="button" aria-label={`선택 품목 ${itemLabel ?? itemId} 해제`} onClick={() => { setItemId(undefined); setItemLabel(undefined); }} className="min-h-11 rounded-full px-3 text-xs font-bold focus-visible:ring-2" style={{ background: tint(LEGACY_COLORS.blue, 12), color: LEGACY_COLORS.blue }}>품목 {itemLabel ?? itemId} ×</button>}
      {(categoryCount > 0 || reason || itemId) && <button type="button" onClick={resetFilters} className="standard-hover min-h-11 rounded-[10px] px-2 text-sm font-bold focus-visible:ring-2" style={{ color: LEGACY_COLORS.blue }}>전체 초기화</button>}
  </>;
  const categoryFilters = <div id="statistics-category-filters" className={mobilePresentation ? undefined : styles.filters} hidden={!filtersOpen}>{filtersOpen && <div className={mobilePresentation ? "mt-2" : undefined}><DefectCategoryFilters departments={availableDepartments} models={modelOptions} currentDept={currentDepartment} showMyDepartment={false} selectedDepartments={selectedDepartments} selectedModels={selectedModels} selectedProcessSteps={selectedProcessSteps} onDepartmentsChange={setSelectedDepartments} onModelsChange={setSelectedModels} onProcessStepsChange={setSelectedProcessSteps} onResetCategoryFilters={resetFilters} /></div>}</div>;
  const periodSelector = <div role="group" aria-label="집계 단위" className={mobilePresentation ? "flex gap-1" : styles.periodButtons}>
    {(Object.keys(PERIOD_LABELS) as DefectStatisticsPeriodKind[]).map((value) => <button key={value} type="button" aria-pressed={period === value} onClick={() => { setAnchor(periodIdentity(queryAnchor, value) > periodIdentity(today, value) ? today : queryAnchor); setPeriod(value); setDetailTrend(false); }} className="min-h-11 rounded-[10px] px-2 text-sm font-bold focus-visible:ring-2" style={{ background: period === value ? tint(LEGACY_COLORS.blue, 14) : LEGACY_COLORS.s2, color: period === value ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2 }}>{PERIOD_LABELS[value]}</button>)}
  </div>;
  const currentPeriodControl = <button type="button" onClick={() => setAnchor(todayInKst())} className="standard-hover min-h-11 rounded-[10px] px-2 text-sm font-bold focus-visible:ring-2" style={{ color: LEGACY_COLORS.blue }}>현재 기간</button>;

  return <div className={`flex min-w-0 flex-col gap-3 ${mobilePresentation ? "" : styles.desktop}`}>
    <header className={mobilePresentation ? "flex min-w-0 flex-col gap-2 rounded-[20px] border px-4 py-3 lg:flex-row lg:items-center lg:justify-between" : styles.header} style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
      <div className={mobilePresentation ? "contents" : styles.headerStart}>
      <div className="flex min-w-0 items-center gap-4"><button type="button" onClick={onBack} className="standard-hover flex min-h-11 shrink-0 items-center gap-1 rounded-[12px] border px-3 text-sm font-bold" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}><ArrowLeft className="h-4 w-4" />작업 선택</button><div className="min-w-0"><h2 className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>불량 통계</h2>{mobilePresentation && <p className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>최초 발생 기준 · 불량·B급·구형 포함</p>}</div></div>
      {!mobilePresentation && periodSelector}
      </div>
      <div className={mobilePresentation ? "flex min-w-0 flex-wrap items-center gap-2" : styles.periodControls}><div role="group" aria-label="조회 기간" className={mobilePresentation ? "flex min-w-0 flex-wrap items-center gap-1" : styles.periodRange}>
        {mobilePresentation && periodSelector}
        <div className={mobilePresentation ? "contents" : styles.dateNavigation}>
        <button type="button" aria-label="이전 기간" onClick={() => setAnchor(shiftStatisticsAnchor(queryAnchor, period, -1))} className="standard-hover flex h-11 w-11 items-center justify-center rounded-[10px] focus-visible:ring-2" style={{ color: LEGACY_COLORS.muted2 }}><ChevronLeft className="h-5 w-5" /></button>
        <p aria-live="polite" className={`min-w-[110px] text-center text-sm font-bold tabular-nums ${mobilePresentation ? "" : styles.periodLabel}`} style={{ color: LEGACY_COLORS.text }}>{periodDisplay(result, queryAnchor, period)}</p>
        <button type="button" aria-label="다음 기간" disabled={nextDisabled} onClick={() => setAnchor(shiftStatisticsAnchor(queryAnchor, period, 1))} className="standard-hover flex h-11 w-11 items-center justify-center rounded-[10px] disabled:opacity-40 focus-visible:ring-2" style={{ color: LEGACY_COLORS.muted2 }}><ChevronRight className="h-5 w-5" /></button>
        </div>
        {mobilePresentation && currentPeriodControl}
      </div>{mobilePresentation && result && <p className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>조회 {asOfLabel(result.as_of)} KST</p>}{!mobilePresentation && <div className={styles.headerEnd}>{currentPeriodControl}</div>}</div>
    </header>

    {mobilePresentation && <section className="min-w-0 rounded-[20px] border px-3 py-2" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}><div className="flex flex-wrap items-center gap-2">
      <><button type="button" aria-label="분류 조건 펼치기" aria-expanded={filtersOpen} aria-controls="statistics-category-filters" onClick={() => setFiltersOpen((value) => !value)} className="standard-hover flex min-h-11 items-center gap-1 rounded-[12px] px-2 text-sm font-bold focus-visible:ring-2" style={{ color: LEGACY_COLORS.blue }}>분류 조건 <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} /></button>
      <span className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>{categoryCount ? `${categoryCount}개 조건 선택` : "전체 부서 · 전체 모델 · 전체 공정"}</span></>
      {filterChips}
      {result && !error && !futureResult && <p className="min-w-0 basis-full break-words text-sm font-medium lg:ml-auto lg:basis-auto lg:flex-1 lg:text-right" style={{ color: LEGACY_COLORS.muted2 }}>{result.is_partial ? "현재까지" : "선택 기간"} 발생 합계 {formatQty(result.summary.quantity)}개({result.summary.record_count}건). 최다 등록 사유는 {topReasons.length ? `${topReasons.map((entry) => entry.label).join(" · ")}(${topReasons.length > 1 ? "각 " : ""}${formatQty(topReasonQty)}개, 전체 ${share(topReasonQty, result.summary.quantity)})` : "없습니다"}. {comparison ? comparison.quantity_delta === 0 ? "이전 비교 기간과 수량이 같습니다." : `이전 비교 기간보다 ${formatQty(Math.abs(comparison.quantity_delta))}개 ${comparison.quantity_delta > 0 ? "많습니다" : "적습니다"}.` : "비교할 이전 기간이 없습니다."}</p>}
    </div>{categoryFilters}</section>}
    {!mobilePresentation && <>
      <StatisticsOverview result={result && !error && !futureResult ? result : null} loading={!result && !error}
        filterToggle={<DefectFilterDisclosure expanded={filtersOpen} onToggle={() => setFiltersOpen((value) => !value)} controlsId="statistics-category-filters" />}
        filterSelection={<div className={styles.filterSelection}>{categoryCount === 0 && !reason && !itemId && <span className={styles.secondary}>전체 부서 · 전체 모델 · 전체 공정</span>}{filterChips}</div>}
      />
      {categoryFilters}
    </>}

    {!result && !error ? <div role="status" aria-label="불량 통계 불러오는 중" aria-busy="true" className="space-y-3"><span className="sr-only">불량 통계 불러오는 중</span>{mobilePresentation ? <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((index) => <SkeletonBlock key={index} className="h-[100px] rounded-[20px]" />)}</div> : null}<div className={`grid gap-3 ${mobilePresentation ? "lg:grid-cols-2" : "xl:grid-cols-2"}`}>{[0, 1, 2, 3].map((index) => <div key={index} data-testid="statistics-panel-skeleton"><SkeletonBlock className={`${mobilePresentation ? "h-[255px]" : "h-[440px]"} rounded-[20px]`} /></div>)}</div></div>
      : error ? <div tabIndex={-1} ref={(node) => { node?.focus(); }}><ReadFailure message={error} onRetry={refresh} /></div>
      : futureResult ? <div role="status" className="rounded-[20px] border p-5 text-sm font-bold" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>미래 기간은 아직 집계하지 않았습니다.</div>
      : result && <>
        {mobilePresentation && <><div className="grid min-w-0 gap-3 lg:grid-cols-2 xl:grid-cols-4">
          <Card label="전체 등록 수량" value={`${formatQty(result.summary.quantity)}개`} detail={`${result.summary.record_count}건 등록`} tone={LEGACY_COLORS.red} />
          <Card label="이전 대비 수량" value={comparison ? signedQty(comparison.quantity_delta) : "비교 없음"} detail={comparison ? `${comparison.quantity_change_pct === null ? "비율 산출 불가" : `${comparison.quantity_change_pct > 0 ? "+" : ""}${Number(comparison.quantity_change_pct.toFixed(1))}%`} · 이전 ${formatQty(comparison.summary.quantity)}개` : "이전 기간 없음"} note={comparison ? `${comparisonBasis(comparison, result.is_partial)}${comparison.summary.quantity === 0 ? " · 이전 수량 0개로 비율을 표시하지 않습니다" : ""}` : undefined} tone={LEGACY_COLORS.yellow} />
          <Card label="최다 등록 사유" value={topReasons.length ? topReasons.map((entry) => entry.label).join(" · ") : "없음"} detail={topReasons.length ? `${formatQty(topReasonQty)}개 · 전체 ${share(topReasonQty, result.summary.quantity)}${topReasons.length > 1 ? " · 공동 1위" : ""}` : "등록된 사유 없음"} tone={LEGACY_COLORS.blue} />
          <Card label={`상위 ${topItems.length}개 품목 집중도`} value={share(topItemsQuantity, result.summary.quantity)} detail={`${formatQty(topItemsQuantity)}개 / 전체 ${formatQty(result.summary.quantity)}개`} tone={LEGACY_COLORS.green} />
        </div>
        <section className="min-w-0 rounded-[20px] border p-3" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
          <CategoryComparison result={result} />
        </section></>}
        <div className={mobilePresentation ? "grid min-w-0 gap-3 lg:grid-cols-2" : styles.panelGrid}>
          <section className={`flex ${mobilePresentation ? "h-[255px]" : `${styles.panel} ${styles.trendPanel}`} min-h-0 min-w-0 flex-col rounded-[20px] border p-4`} style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}><div className={mobilePresentation ? "flex shrink-0 items-center justify-between gap-2" : styles.panelHeading}><h3 className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>{detailTrend ? "선택 기간 상세" : "최근 추이"}</h3><button type="button" onClick={() => setDetailTrend((value) => !value)} className="standard-hover min-h-11 rounded-[10px] px-2 text-sm font-bold focus-visible:ring-2" style={{ color: LEGACY_COLORS.blue }}>{detailTrend ? "최근 추이 보기" : "선택 기간 상세"}</button></div><p className={`shrink-0 ${mobilePresentation ? "text-xs" : styles.secondary}`} style={{ color: LEGACY_COLORS.muted2 }}>{detailTrend ? "선택 기간의 일별·월별 발생 수량" : period === "week" ? "최근 8주" : period === "month" ? "최근 6개월" : "최근 3년"}{!detailTrend && result.trend.some((entry) => entry.is_partial) ? " · 집계 중" : ""}</p>
            {trend.length === 0 ? <EmptyState compact className="min-h-0 flex-1" title="표시할 추이가 없습니다." description="" /> : <div className={mobilePresentation ? "mt-2 min-h-0 flex-1" : styles.chart}><ResponsiveContainer width="100%" height="100%"><BarChart data={trend} margin={{ top: 12, right: 8, left: mobilePresentation ? -18 : 0, bottom: 0 }}><CartesianGrid stroke={LEGACY_COLORS.border} vertical={false} /><XAxis dataKey="label" tick={{ fill: LEGACY_COLORS.muted2, fontSize: mobilePresentation ? 12 : 14 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: LEGACY_COLORS.muted2, fontSize: mobilePresentation ? 12 : 14 }} axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip contentStyle={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, borderRadius: 12 }} /><Bar dataKey="quantity" name="발생 수량" fill={LEGACY_COLORS.red} radius={[8, 8, 2, 2]} /></BarChart></ResponsiveContainer></div>}
          </section>
          <ItemComparison result={result} selected={itemId} onSelect={selectItem} mobilePresentation={mobilePresentation} page={pages.items} onPageChange={(page) => setPages((current) => ({ ...current, items: page }))} />
          <BreakdownPanel title="부서별 집계" entries={result.departments} total={result.summary.quantity} onSelect={selectDepartment} selected={selectedDepartments.length === 1 ? selectedDepartments[0] : undefined} mobilePresentation={mobilePresentation} page={pages.departments} onPageChange={(page) => setPages((current) => ({ ...current, departments: page }))} />
          <BreakdownPanel title="사유별 집계" entries={result.reasons} total={result.summary.quantity} onSelect={selectReason} selected={reason} mobilePresentation={mobilePresentation} page={pages.reasons} onPageChange={(page) => setPages((current) => ({ ...current, reasons: page }))} />
        </div>
        {mobilePresentation && <div className="space-y-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}><StatisticsNotes result={result} /></div>}
      </>}
  </div>;
}
