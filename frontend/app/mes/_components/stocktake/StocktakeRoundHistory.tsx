"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, History } from "lucide-react";
import { stocktakeApi } from "@/lib/api/stocktake";
import type { StocktakeEvent, StocktakePage, StocktakeRound } from "@/lib/api/types/stocktake";
import { useRealtimeRevision } from "@/lib/queries/realtime";
import { formatKstDateTime } from "@/lib/mes-format";
import { formatQty } from "@/lib/mes/format";
import { CATEGORY_LABELS, STOCKTAKE_BUTTON, STOCKTAKE_CARD } from "./StocktakeCountEditor";
import { EVENT_LABELS } from "./StocktakeProgressPanel";
import { StocktakeRoundHeader, STOCKTAKE_ROUND_LABELS as ROUND_LABELS } from "./StocktakeRoundHeader";
import { StocktakeActivityDisclosure } from "./StocktakeActivityDisclosure";

type CloseEvidence = { mode: "FULL" | "PARTIAL"; reason: string; actor_name: string; closed_at: string; manifest_id: string };
type Props = { token: string; round: StocktakeRound | null; rounds: StocktakeRound[]; admin: boolean; disabled?: boolean; onSelectRound: (id: string) => void; management?: ReactNode; menuVisibility?: ReactNode };

/** Independent query keys keep late responses bound to the recorded round and filter. */
export function StocktakeRoundHistory({ token, round, rounds, admin, disabled = false, onSelectRound, management, menuVisibility }: Props): ReactNode {
  const [choosing, setChoosing] = useState(false);
  const [includeSaves, setIncludeSaves] = useState(false);
  const queryClient = useQueryClient();
  const revision = useRealtimeRevision();
  const previousRevision = useRef(revision);
  const events = useInfiniteQuery({
    queryKey: ["stocktake", "round-history", token, round?.round_id, includeSaves], initialPageParam: "",
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: "20", order: "latest", include_saves: String(includeSaves) });
      if (pageParam) params.set("cursor", pageParam);
      return stocktakeApi.read<StocktakePage<StocktakeEvent>>(`/api/stocktakes/rounds/${round!.round_id}/events?${params}`, token, { signal });
    },
    getNextPageParam: page => page.next_cursor ?? undefined, enabled: !!round, retry: false,
  });
  const evidence = useQuery({
    queryKey: ["stocktake", "round-close-evidence", token, round?.round_id],
    queryFn: ({ signal }) => stocktakeApi.read<CloseEvidence>(`/api/stocktakes/rounds/${round!.round_id}/close-evidence`, token, { signal }),
    enabled: !!round && round.status !== "ACTIVE", retry: false,
  });
  useEffect(() => { setChoosing(false); }, [round?.round_id]);
  useEffect(() => {
    if (previousRevision.current === revision) return;
    previousRevision.current = revision;
    void queryClient.invalidateQueries({ queryKey: ["stocktake", "round-history", token] });
    void queryClient.invalidateQueries({ queryKey: ["stocktake", "round-close-evidence", token] });
  }, [revision, token, queryClient]);
  const entries = [...new Map(events.data?.pages.flatMap(page => page.items).map(event => [event.event_id, event]) ?? []).values()];
  const missingEvidence = (evidence.error as { code?: string } | null)?.code === "NOT_FOUND";
  return <div className="min-w-0 space-y-4 text-sm text-[var(--c-text)]">
    <StocktakeRoundHeader round={round} actions={!!rounds.length && <button type="button" className={`${STOCKTAKE_BUTTON} flex w-full shrink-0 items-center justify-between gap-4 sm:w-auto sm:min-w-40`} aria-expanded={choosing} aria-controls="stocktake-round-choices" disabled={disabled} onClick={() => setChoosing(open => !open)}>회차 변경<ChevronDown size={16} aria-hidden="true" className={choosing ? "rotate-180" : ""} /></button>}>
      {choosing && <ul id="stocktake-round-choices" className="mt-4 grid gap-2 border-t border-[var(--c-border)] pt-3 lg:grid-cols-2">{rounds.map(item => <li key={item.round_id} className="min-w-0"><button type="button" disabled={disabled} aria-pressed={item.round_id === round?.round_id} onClick={() => { if (item.round_id === round?.round_id) setChoosing(false); else onSelectRound(item.round_id); }} className={`min-h-11 w-full rounded-xl p-3 text-left disabled:opacity-50 ${item.round_id === round?.round_id ? "bg-[var(--c-s2)] text-[var(--c-blue)]" : "text-[var(--c-text)]"}`}><span className="block break-words font-semibold">{item.title}</span><span className="mt-1 block text-xs text-[var(--c-muted2)]">{ROUND_LABELS[item.status]} · {formatKstDateTime(item.started_at)} KST</span></button></li>)}</ul>}
    </StocktakeRoundHeader>
    <div className="min-w-0 space-y-4">
    <div className={`grid min-w-0 items-start gap-4${menuVisibility ? " xl:grid-cols-[minmax(0,min(46%,760px))_minmax(0,1fr)]" : round ? " xl:grid-cols-[minmax(0,1fr)_400px]" : ""}`}>
      {management}
      {(menuVisibility || round) && <div className={`grid min-w-0 items-start gap-4${menuVisibility ? " 2xl:grid-cols-2" : ""}`}>
      {menuVisibility}
      {round && <section className={STOCKTAKE_CARD} aria-label="회차 종료 결과"><h2 className="text-base font-semibold">종료 결과</h2>
        {round.status === "ACTIVE" ? <p className="mt-3 text-[var(--c-muted2)]">진행 중인 회차입니다.</p> : evidence.isPending ? <p role="status" className="mt-3 text-[var(--c-muted2)]">종료 결과를 불러오는 중입니다.</p> : missingEvidence ? <p className="mt-3 text-[var(--c-muted2)]">이 회차의 종료 증빙이 없습니다.</p> : evidence.isError ? <ReadError error={evidence.error} label="종료 결과 다시 불러오기" onRetry={() => void evidence.refetch()} /> : evidence.data && <>
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3"><dt className="text-[var(--c-muted2)]">종료 방식</dt><dd>{evidence.data.mode === "FULL" ? "전체 종료" : "부분 종료"}</dd><dt className="text-[var(--c-muted2)]">사유</dt><dd className="break-words">{evidence.data.reason || "사유 기록 없음"}</dd><dt className="text-[var(--c-muted2)]">승인자</dt><dd>{evidence.data.actor_name}</dd><dt className="text-[var(--c-muted2)]">종료 시각</dt><dd className="break-words">{formatKstDateTime(evidence.data.closed_at)} KST</dd></dl>
        </>}
      </section>}
      </div>}
    </div>
    {round && <section className="min-w-0" aria-label="회차 작업 이력">
      <StocktakeActivityDisclosure title="작업 이력" icon={<History size={16} aria-hidden="true" />} includeSaves={includeSaves} onIncludeSavesChange={setIncludeSaves} defaultOpen compact>
      {events.isPending ? <p role="status" className="py-3 text-[var(--c-muted2)]">작업 이력을 불러오는 중입니다.</p> : entries.length ? <ol className="grid min-w-0 grid-cols-1 gap-x-6 xl:grid-cols-2">{entries.map(event => <HistoryEntry key={event.event_id} event={event} admin={admin} />)}</ol> : !events.error && <p className="py-3 text-[var(--c-muted2)]">이 회차에 기록된 작업이 없습니다.</p>}
      {events.error && <ReadError error={events.error} label="작업 이력 다시 불러오기" onRetry={() => void (events.isFetchNextPageError ? events.fetchNextPage() : events.refetch())} />}
      {events.hasNextPage && <button type="button" className={`${STOCKTAKE_BUTTON} mt-3 w-full`} disabled={events.isFetching} onClick={() => void events.fetchNextPage()}>{events.isFetchingNextPage ? "불러오는 중…" : "이력 더 보기"}</button>}
      </StocktakeActivityDisclosure>
    </section>}
    </div>
  </div>;
}

/** Display sealed event facts without filling historic gaps from today's inventory. */
function HistoryEntry({ event, admin }: { event: StocktakeEvent; admin: boolean }): ReactNode {
  const quantities = event.payload.quantities;
  return <li className="min-w-0 border-b border-[var(--c-border)]"><details className="group">
    <summary className="flex min-h-11 cursor-pointer items-start gap-3 py-3"><div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className={`shrink-0 text-sm font-semibold ${event.kind === "COUNT_APPLIED" ? "text-[var(--c-green)]" : "text-[var(--c-blue)]"}`}>{EVENT_LABELS[event.kind] || "기타 작업"}</span><p className="min-w-0 break-words text-sm"><span>{event.item_name || "회차 작업"}</span>{event.item_name && event.scope_name && ` · ${event.scope_name}`}</p></div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-[var(--c-muted2)]"><p className="min-w-0 break-words">{[event.actor_name, event.item_code].filter(Boolean).join(" · ")}</p><time dateTime={event.created_at}>{formatKstDateTime(event.created_at)} KST</time></div>
    </div><ChevronDown size={16} aria-hidden="true" className="mt-1 shrink-0 text-[var(--c-muted2)] transition-transform group-open:rotate-180" /></summary>
    <div className="space-y-2 pb-3 text-sm">
      {quantities && typeof quantities === "object" && ["DRAFT_SAVED", "COUNT_CONFIRMED"].includes(event.kind) ? <dl className="grid grid-cols-2 gap-2 rounded-xl bg-[var(--c-s2)] p-3">{(Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>).map(category => { const value = (quantities as Record<string, unknown>)[category]; return <div key={category} className="flex items-baseline justify-between gap-2"><dt className="text-xs text-[var(--c-muted2)]">{CATEGORY_LABELS[category]}</dt><dd className="font-semibold tabular-nums">{typeof value === "number" ? `${formatQty(value)}${event.unit ? ` ${event.unit}` : ""}` : "수량 기록 없음"}</dd></div>; })}</dl> : <p className="text-xs text-[var(--c-muted2)]">이 작업에는 계수 수량 기록이 없습니다.</p>}
      {typeof event.payload.reason === "string" && event.payload.reason && <p className="break-words">사유: {event.payload.reason}</p>}
      {typeof event.payload.target_count === "number" && <p>조사 위치 {event.payload.target_count.toLocaleString()}건</p>}
      {admin && <details><summary className="flex min-h-11 cursor-pointer items-center text-xs text-[var(--c-muted2)]">원본 증빙</summary><pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-[var(--c-s2)] p-3 text-xs">{JSON.stringify(event.payload, null, 2)}</pre></details>}
    </div>
  </details></li>;
}

function ReadError({ error, label, onRetry }: { error: Error; label: string; onRetry: () => void }): ReactNode {
  return <div className="mt-3 space-y-2"><p role="alert" className="break-words text-sm text-[var(--c-red)]">{error.message}</p><button type="button" className={STOCKTAKE_BUTTON} onClick={onRetry}>{label}</button></div>;
}
