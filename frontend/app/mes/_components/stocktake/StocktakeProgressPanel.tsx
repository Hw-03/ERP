import type { ReactNode } from "react";
import type { StocktakeEvent, StocktakeProgress, StocktakeProgressSummary } from "@/lib/api/types/stocktake";
import { formatKstDateTime } from "@/lib/mes-format";
import { formatQty } from "@/lib/mes/format";
import { CATEGORY_LABELS, STOCKTAKE_CARD } from "./StocktakeCountEditor";
import { StocktakeWorkers } from "./StocktakeWorkers";
import { StocktakeProgressSkeleton } from "./StocktakeProgressSkeleton";
import { dataRevealClassName } from "../common/LoadingSkeleton";

export const EVENT_LABELS: Record<string, string> = { ROUND_STARTED: "회차 시작", TARGETS_APPENDED: "조사 대상 추가", COUNT_STARTED: "조사 시작", RECOUNT_STARTED: "재조사 시작", DRAFT_SAVED: "계수 저장", COUNT_CONFIRMED: "계수 확인", CONFIRMATION_CANCELLED: "확인 취소", EDIT_RESUMED: "수정 재개", COUNT_ABANDONED: "조사 중단", COUNT_FORCE_RELEASED: "관리자 잠금 해제", COUNT_APPLIED: "재고 반영", ROUND_CLOSED: "회차 종료" };
type GroupRow = StocktakeProgressSummary & { scope_name?: string };

function Meter({ label, value, total, applied = false, compact = false }: { label: string; value: number; total: number; applied?: boolean; compact?: boolean }) {
  const percent = total ? Math.min(100, Math.max(0, value * 100 / total)) : 0;
  return <div className="min-w-0 w-full space-y-1.5">
    <div className={`flex items-baseline gap-x-2 gap-y-1 text-xs ${compact ? "justify-end" : "flex-wrap justify-between"}`}><span className={compact ? "sr-only" : "shrink-0 text-[var(--c-muted2)]"}>{label}</span><span className="ml-auto whitespace-nowrap tabular-nums"><b className="text-sm">{value.toLocaleString()}</b> / {total.toLocaleString()} <span className="text-[var(--c-muted2)]">({percent.toFixed(1)}%)</span></span></div>
    <progress aria-label={label} value={value} max={total || 1} className={`block h-1.5 w-full appearance-none overflow-hidden rounded-full bg-[var(--c-border)] [&::-webkit-progress-bar]:bg-[var(--c-border)] ${applied ? "[&::-webkit-progress-value]:bg-[var(--c-green)] [&::-moz-progress-bar]:bg-[var(--c-green)]" : "[&::-webkit-progress-value]:bg-[var(--c-blue)] [&::-moz-progress-bar]:bg-[var(--c-blue)]"}`} />
  </div>;
}

function Groups({ rows }: { rows: GroupRow[] }) {
  if (!rows.length) return <p className="py-3 text-sm text-[var(--c-muted2)]">집계된 대상이 없습니다.</p>;
  return <>
    <div className="divide-y divide-[var(--c-border)] lg:hidden">{rows.map((row, index) => <section key={index} className="py-4" aria-label={row.scope_name}>
      <div className="mb-3 flex items-baseline justify-between gap-2"><h4 className="min-w-0 break-words font-semibold">{row.scope_name || "미지정"}</h4><span className="shrink-0 text-xs text-[var(--c-muted2)]">대상 {row.total.toLocaleString()}건</span></div>
      <div className="space-y-3"><Meter label="확인" value={row.confirmed} total={row.total} /><Meter label="반영" value={row.applied} total={row.total} applied /></div>
    </section>)}</div>
    <table className="hidden w-full table-fixed text-left lg:table"><caption className="sr-only">위치별 진행</caption><thead className="text-xs text-[var(--c-muted2)]"><tr><th className="w-16 py-3">위치 · 대상</th><th className="px-3 text-right">확인</th><th className="px-3 text-right">반영</th></tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="h-16 border-t border-[var(--c-border)]"><th className="break-words py-3 font-semibold">{row.scope_name || "미지정"}<span className="mt-1 block text-xs font-normal text-[var(--c-muted2)]">{row.total.toLocaleString()}건</span></th><td className="px-3"><Meter label="확인" value={row.confirmed} total={row.total} compact /></td><td className="px-3"><Meter label="반영" value={row.applied} total={row.total} applied compact /></td></tr>)}</tbody></table>
  </>;
}

/** Keep location metrics separate from worker metrics and preserve recorded legacy totals. */
export function StocktakeProgressPanel({ progress, loading = false, active, roundInfo, evidence, activity, workerQuantityMode, onWorkerQuantityModeChange }: { progress?: StocktakeProgress; loading?: boolean; active: boolean; roundInfo?: ReactNode; evidence?: ReactNode; activity?: ReactNode; workerQuantityMode?: boolean; onWorkerQuantityModeChange?: (quantity: boolean) => void }): ReactNode {
  const summary = progress?.summary;
  return <div role={loading ? "status" : undefined} aria-busy={loading || undefined} aria-label={loading ? "진행 현황을 불러오는 중입니다" : undefined} className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,min(46%,760px))_minmax(0,1fr)] xl:items-start xl:gap-4">
    {loading && <span className="sr-only">진행 현황을 불러오는 중입니다</span>}
    <div className="min-w-0 empty:hidden xl:col-start-1 xl:col-span-2 xl:row-start-1">{roundInfo}</div>
    {(loading || progress) && <section className={`${STOCKTAKE_CARD} min-w-0 xl:col-start-1 xl:row-start-2`} aria-label="위치별 진행"><h2 className="mb-4 text-base font-semibold">위치별 진행</h2>
      {summary && progress ? <div className={dataRevealClassName}>
      <div className="grid gap-4 rounded-xl bg-[var(--c-s2)] p-3 lg:grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)] lg:gap-0 lg:px-0">
        <div className="hidden min-w-0 lg:block lg:pl-3"><span className="block font-semibold">전체</span><span className="mt-1 block text-xs text-[var(--c-muted2)]">{summary.total.toLocaleString()}건</span></div>
        <div className="min-w-0 lg:px-3"><Meter label="전체 위치 확인" value={summary.confirmed} total={summary.total} /></div>
        <div className="min-w-0 lg:px-3"><Meter label="전체 위치 반영" value={summary.applied} total={summary.total} applied /></div>
      </div>
      <Groups rows={progress.by_scope} />
      <div className="mt-2 rounded-xl bg-[var(--c-s2)] p-3 text-sm"><span className="text-[var(--c-muted2)]">{active ? "반영 대기 위치" : "종료 시 미반영 위치"}</span><b className="float-right tabular-nums">{summary.confirmed_excluded.toLocaleString()}건</b></div>
      {(summary.held > 0 || summary.pending > 0) && <p className="mt-3 text-sm font-semibold text-[var(--c-yellow)]">보류 {summary.held}건 · 미편입 대기 {summary.pending}건</p>}
      {!progress.item_summary && <p className="mt-2 text-xs">이전 종료 증빙에는 품목 집계가 없습니다. 위치별 집계만 표시합니다.</p>}
      </div> : <StocktakeProgressSkeleton region="locations" active={active} />}
    </section>}
    {(loading || progress) && <div className="min-w-0 xl:relative xl:col-start-2 xl:row-start-2 xl:self-stretch">
      <section className={`${STOCKTAKE_CARD} min-w-0 xl:absolute xl:inset-y-0 xl:left-0 xl:right-3.5`} aria-label="작업자별 현황">
        <div className="sg xl:absolute xl:inset-y-4 xl:left-4 xl:-right-2.5 xl:overflow-x-hidden xl:overflow-y-auto xl:[scrollbar-gutter:stable]" tabIndex={0} role="region" aria-label="작업자 목록">
          <div className="xl:pr-4">
            {progress ? <div className={dataRevealClassName}><StocktakeWorkers progress={progress} quantityMode={workerQuantityMode} onQuantityModeChange={onWorkerQuantityModeChange} /></div> : <StocktakeProgressSkeleton region="workers" active={active} quantityMode={workerQuantityMode} />}
          </div>
        </div>
      </section>
    </div>}
    <div className="min-w-0 space-y-3 empty:hidden xl:col-start-1 xl:col-span-2 xl:row-start-3">{evidence}{activity}</div>
  </div>;
}

/** Translate recorded evidence only; current counts must never fill historical gaps. */
export function StocktakeActivity({ events, admin }: { events: StocktakeEvent[]; admin: boolean }) {
  return <ol className="grid grid-cols-1 gap-x-6 xl:grid-cols-2">{events.map(event => {
    const quantities = event.payload.quantities;
    return <li key={event.event_id} className="min-w-0 border-b border-[var(--c-border)] py-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h3 className={`shrink-0 font-semibold ${event.kind === "COUNT_APPLIED" ? "text-[var(--c-green)]" : "text-[var(--c-blue)]"}`}>{EVENT_LABELS[event.kind] || "기타 작업"}</h3><p className="min-w-0 break-words text-sm">{event.item_name ? `${event.item_name}${event.scope_name ? ` · ${event.scope_name}` : ""}` : "회차 작업"}</p></div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-[var(--c-muted2)]"><p className="min-w-0 break-words">{event.actor_name}{event.item_code ? ` · ${event.item_code}` : ""}</p><time dateTime={event.created_at}>{formatKstDateTime(event.created_at)} KST</time></div>
      {Boolean(quantities) && typeof quantities === "object" && ["DRAFT_SAVED", "COUNT_CONFIRMED"].includes(event.kind) && <dl className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[var(--c-s2)] p-3">{(Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>).map(category => { const value = (quantities as Record<string, unknown>)[category]; return <div className="flex items-baseline justify-between gap-2" key={category}><dt className="text-xs text-[var(--c-muted2)]">{CATEGORY_LABELS[category]}</dt><dd className="text-sm font-semibold tabular-nums">{typeof value === "number" ? `${formatQty(value)}${event.unit ? ` ${event.unit}` : ""}` : "미입력"}</dd></div>; })}</dl>}
      {typeof event.payload.reason === "string" && event.payload.reason && <p className="mt-2 break-words text-sm">사유: {event.payload.reason}</p>}
      {typeof event.payload.target_count === "number" && <p className="mt-2 text-sm">조사 대상 {event.payload.target_count.toLocaleString()}건</p>}
      {admin && <details className="mt-1"><summary className="flex min-h-11 cursor-pointer items-center text-xs text-[var(--c-muted2)]">원본 증빙</summary><pre className="max-h-64 overflow-auto rounded-xl bg-[var(--c-s2)] p-3 text-xs">{JSON.stringify(event.payload, null, 2)}</pre></details>}
    </li>;
  })}</ol>;
}
