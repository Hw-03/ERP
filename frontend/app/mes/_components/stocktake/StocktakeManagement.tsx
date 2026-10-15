"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { isStocktakeNotApplied, stocktakeApi } from "@/lib/api/stocktake";
import type { StocktakeCommandKind, StocktakeEvent, StocktakeProgress, StocktakeProgressSummary } from "@/lib/api/types/stocktake";
import { useRegisterDirty } from "@/lib/ui/dirty-guard";
import { useRealtimeRevision } from "@/lib/queries/realtime";
import { formatKstDateTime } from "@/lib/mes-format";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { Operator } from "../login/useCurrentOperator";
import type { RecoveredStocktakeCommand } from "./StocktakeCommandRecovery";
import { CATEGORY_LABELS, STOCKTAKE_CARD } from "./StocktakeCountEditor";
import { StocktakeActivity, StocktakeProgressPanel } from "./StocktakeProgressPanel";
import { StocktakeDisclosure } from "./StocktakeDisclosure";
import { StocktakeRoundHeader } from "./StocktakeRoundHeader";
import { StocktakeActivityDisclosure } from "./StocktakeActivityDisclosure";
import { canManageStocktakeRounds } from "./stocktakeAuthority";
import styles from "./StocktakeManagement.module.css";

type Round = { round_id: string; title: string; status: string; epoch: number; target_generation: number; started_at?: string; closed_at?: string | null };
type Page<T> = { items: T[]; next_cursor?: string | null; next_offset?: number | null; total?: number };
type Summary = StocktakeProgressSummary;
type Progress = StocktakeProgress;
type Preview = { preview_id: string; preview_hash: string; expires_at?: string; can_close?: boolean; summary?: Summary; target_count?: number; count?: number; manifest_id?: string; no_targets?: boolean; targets?: Array<{ item_id: string; scope_key: string; item_name: string; item_code: string; scope_name: string }> };
type Event = StocktakeEvent;
type PreparationIssue = { item_code?: string; item_name?: string; scope_name?: string; scope_id?: string; reason: string };
type Props = { token: string; operator: Operator; round: Round | null; onChanged: () => void; section: "progress" | "rounds"; recovered?: RecoveredStocktakeCommand | null; focusStart?: boolean; onStarted?: () => void };

const card = STOCKTAKE_CARD;
const button = "min-h-11 rounded-xl border border-[var(--c-border)] bg-[var(--c-s2)] px-4 py-2 text-sm font-semibold text-[var(--c-text)] disabled:cursor-not-allowed disabled:opacity-50";
const field = "min-h-11 w-full rounded-xl border border-[var(--c-border)] bg-[var(--c-s2)] px-3 py-2 text-sm text-[var(--c-text)]";

function message(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "요청을 완료하지 못했습니다. 상태와 영수증을 확인해 주세요.";
}

function code(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
}

function idempotencyKey(): string { return crypto.randomUUID(); }

/** Keep input values mounted while animating height and excluding inactive controls. */
function ManagementFields({ open, children }: { open: boolean; children: ReactNode }): ReactNode {
  return <div className={`${styles.fields} ${open ? styles.expanded : ""}`} aria-hidden={!open} inert={!open}>
    <div className={styles.content}>{children}</div>
  </div>;
}

/** Describe the recovered operation without exposing receipt identifiers in the main flow. */
function completionMessage(kind: string, result?: unknown): string {
  if (kind === "target_append_preview" && result && typeof result === "object" && "no_targets" in result && result.no_targets === true) return "추가할 조사 대상이 없습니다.";
  return { round_close: "회차를 종료했습니다.", round_start: "회차를 시작했습니다.", target_append: "조사 대상을 추가했습니다.", round_close_preview: "종료 내용 확인을 마쳤습니다. 다시 내용을 확인해 주세요.", round_start_preview: "시작 대상 확인을 마쳤습니다. 다시 내용을 확인해 주세요.", target_append_preview: "추가 대상 확인을 마쳤습니다. 다시 내용을 확인해 주세요." }[kind] ?? "요청을 완료했습니다.";
}

export function StocktakeManagement({ token, operator, round, onChanged, section, recovered, focusStart = false, onStarted }: Props): ReactNode {
  const canManageRounds = canManageStocktakeRounds(operator);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [progressPending, setProgressPending] = useState(section === "progress" && !!round);
  const [workerQuantityMode, setWorkerQuantityMode] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [eventCursor, setEventCursor] = useState<string | null>(null);
  const [includeSaves, setIncludeSaves] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingMoreEvents, setLoadingMoreEvents] = useState(false);
  const activityUrl = round ? `/api/stocktakes/rounds/${round.round_id}/events?limit=20&order=latest&include_saves=${includeSaves}` : "";
  const [evidence, setEvidence] = useState<Record<string, unknown> | null>(null);
  const [entries, setEntries] = useState<Array<Record<string, unknown>>>([]);
  const [entriesReady, setEntriesReady] = useState(false);
  const [entryOffset, setEntryOffset] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [managementAction, setManagementAction] = useState<"close" | "append">("close");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"FULL" | "PARTIAL">("FULL");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<{ kind: "start" | "append" | "close"; data: Preview } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preparationIssues, setPreparationIssues] = useState<PreparationIssue[]>([]);
  const [unknown, setUnknown] = useState<{ kind: string; key: string } | null>(null);
  const busyRef = useRef(false);
  const loadGeneration = useRef(0);
  const realtimeRevision = useRealtimeRevision();
  useEffect(() => {
    if (recovered?.token === token && unknown?.key === recovered.entry.key && unknown.kind === recovered.entry.kind) {
      setUnknown(null); setPreview(null); setError("");
      setNotice(recovered.resolution === "COMPLETED" ? completionMessage(recovered.entry.kind, recovered.result) : "요청이 반영되지 않았습니다. 다시 내용을 확인해 주세요.");
      if (recovered.resolution === "COMPLETED" && recovered.entry.kind === "round_start") onStarted?.();
    }
  }, [recovered, token, unknown, onStarted]);
  const roundRef = useRef(round?.round_id ?? null);
  const selectionRef = useRef("");
  const titleRef = useRef(title);
  const action = round?.status === "ACTIVE" ? managementAction : "start";
  const actionRef = useRef(action);
  actionRef.current = action;
  const previewIdRef = useRef(preview?.data.preview_id ?? null);
  roundRef.current = round?.round_id ?? null;
  selectionRef.current = JSON.stringify({ mode, reason });
  titleRef.current = title;
  previewIdRef.current = preview?.data.preview_id ?? null;
  useRegisterDirty(`stocktake-management-${section}`, busy || !!unknown, async () => { throw new Error("명령 결과를 먼저 확인해 주세요."); }, undefined, { mode: "auto-save", warnOnUnload: true });

  useEffect(() => { setPreview(null); setEntriesReady(false); setProgress(null); setEvidence(null); setManagementAction("close"); setNotice(""); }, [round?.round_id]);

  const refresh = useCallback(async () => {
    const generation = ++loadGeneration.current;
    if (section === "rounds" && !canManageRounds) return;
    if (section === "progress") { setProgressPending(!!round); setLoadingEvents(!!round); setEventCursor(null); setError(""); }
    if (!round) { setProgress(null); setEvents([]); setEvidence(null); return; }
    if (section === "progress") {
      try {
        const [stats, history] = await Promise.all([
          stocktakeApi.read<Progress>(`/api/stocktakes/rounds/${round.round_id}/progress`, token),
          stocktakeApi.read<Page<Event>>(activityUrl, token),
        ]);
        if (generation !== loadGeneration.current) return;
        setProgress(stats); setEvents(history.items); setEventCursor(history.next_cursor ?? null);
        if (round.status !== "ACTIVE") {
          const proof = await stocktakeApi.read<Record<string, unknown>>(`/api/stocktakes/rounds/${round.round_id}/close-evidence`, token);
          if (generation !== loadGeneration.current) return;
          setEvidence(proof);
        } else setEvidence(null);
      } catch (cause) {
        if (generation === loadGeneration.current) setError(message(cause));
      } finally {
        if (generation === loadGeneration.current) { setProgressPending(false); setLoadingEvents(false); }
      }
    }
  }, [round, section, token, activityUrl, canManageRounds]);

  useEffect(() => {
    if (section !== "progress") return;
    const reads = loadGeneration;
    void refresh();
    // A retry may start after this effect; invalidate that request on cleanup too.
    return () => { ++reads.current; };
  }, [section, realtimeRevision, refresh]);

  const run = async (kind: StocktakeCommandKind, path: string, payload: Record<string, unknown>): Promise<Preview | null> => {
    if (!canManageRounds || busyRef.current || unknown) return null;
    const submittedRound = roundRef.current;
    const submittedAction = actionRef.current;
    const key = idempotencyKey();
    busyRef.current = true;
    setBusy(true); setError(""); setNotice(""); setPreparationIssues([]);
    try {
      const result = await stocktakeApi.command<Preview>(kind, path, token, payload, { key });
      // A successful start can arrive after realtime already published its new round.
      // Only the acknowledged command may leave the start/recovery screen.
      if (kind === "round_start" && onStarted) { onChanged(); onStarted(); return null; }
      return roundRef.current === submittedRound && actionRef.current === submittedAction ? result : null;
    } catch (cause) {
      if (roundRef.current !== submittedRound || actionRef.current !== submittedAction) return null;
      setError(message(cause));
      const issues = (cause as { extra?: { items?: PreparationIssue[] } } | null)?.extra?.items;
      if (code(cause) === "TARGET_SET_CHANGED" && Array.isArray(issues)) {
        setPreparationIssues(issues.filter(issue => issue && typeof issue.reason === "string"));
      }
      if (code(cause) === "COMMAND_RESULT_UNKNOWN") setUnknown({ kind, key });
      if (code(cause) === "PREVIEW_STALE") setPreview(null);
      return null;
    } finally { busyRef.current = false; setBusy(false); }
  };

  const prepareStart = async () => {
    if (round?.status === "ACTIVE" || !title.trim()) { setError("활성 회차를 확인하고 회차 이름을 입력해 주세요."); return; }
    const submittedTitle = title.trim();
    const previousRoundId = round?.round_id ?? null;
    const data = await run("round_start_preview", "/api/stocktakes/round-start-previews", { title: title.trim() });
    if (data && actionRef.current === "start" && roundRef.current === previousRoundId && titleRef.current.trim() === submittedTitle) setPreview({ kind: "start", data });
  };
  const prepareAppend = async () => {
    if (!round) return;
    const roundId = round.round_id;
    const data = await run("target_append_preview", `/api/stocktakes/rounds/${roundId}/target-append-previews`, {});
    if (data && actionRef.current === "append" && roundRef.current === roundId) {
      if (data.no_targets === true) { setPreview(null); setNotice("추가할 조사 대상이 없습니다."); }
      else setPreview({ kind: "append", data });
    }
  };
  const prepareClose = async () => {
    if (!round) return;
    if (mode === "PARTIAL" && !reason.trim()) { setError("부분 종료 사유를 입력해 주세요."); return; }
    const roundId = round.round_id;
    const selection = selectionRef.current;
    const data = await run("round_close_preview", `/api/stocktakes/rounds/${roundId}/close-previews`, { mode, reason: reason.trim(), confirmation_revision_ids: [] });
    if (data && actionRef.current === "close" && roundRef.current === roundId && selectionRef.current === selection) {
      setPreview({ kind: "close", data }); setEntries([]); setEntryOffset(0); setEntriesReady(false);
      busyRef.current = true; setBusy(true);
      try {
        const page = await stocktakeApi.read<Page<Record<string, unknown>>>(`/api/stocktakes/close-previews/${data.preview_id}/entries?offset=0&limit=100`, token);
        if (actionRef.current === "close" && roundRef.current === roundId && selectionRef.current === selection) { setEntries(page.items); setEntryOffset(page.next_offset ?? null); setEntriesReady(true); }
      } catch (cause) { if (actionRef.current === "close" && roundRef.current === roundId) setError(message(cause)); }
      finally { busyRef.current = false; setBusy(false); }
    }
  };
  const submit = async () => {
    if (!preview) return;
    const { kind, data } = preview;
    const path = kind === "start" ? "/api/stocktakes/rounds" : kind === "append" ? `/api/stocktakes/rounds/${round?.round_id}/target-appends` : `/api/stocktakes/rounds/${round?.round_id}/close`;
    const command = kind === "start" ? "round_start" : kind === "append" ? "target_append" : "round_close";
    const result = await run(command, path, { preview_id: data.preview_id, preview_hash: data.preview_hash });
    if (result) { setPreview(null); setNotice(completionMessage(command)); onChanged(); await refresh(); if (kind === "start") onStarted?.(); }
  };
  const lookup = async () => {
    if (!unknown) return;
    setBusy(true);
    try {
      const result = await stocktakeApi.read<Record<string, unknown>>(`/api/stocktakes/commands/${encodeURIComponent(unknown.key)}?kind=${encodeURIComponent(unknown.kind)}`, token);
      setError(""); setNotice(completionMessage(unknown.kind, result)); setUnknown(null); setPreview(null); onChanged(); await refresh();
      if (unknown.kind === "round_start") onStarted?.();
    } catch (cause) {
      if (isStocktakeNotApplied(cause)) { setUnknown(null); setPreview(null); setError("미반영으로 확정된 요청입니다."); onChanged(); }
      else setError(`영수증을 확인하지 못했습니다. 같은 키를 보관하고 부서 결재 담당자에게 확인하세요. ${message(cause)}`);
    }
    finally { setBusy(false); }
  };
  const moreEvents = async () => {
    if (!round || !eventCursor || loadingMoreEvents || loadingEvents) return;
    const generation = loadGeneration.current;
    setLoadingMoreEvents(true);
    try {
      const page = await stocktakeApi.read<Page<Event>>(`${activityUrl}&cursor=${encodeURIComponent(eventCursor)}`, token);
      if (generation === loadGeneration.current) { setEvents(previous => [...previous, ...page.items]); setEventCursor(page.next_cursor ?? null); }
    } catch (cause) { if (generation === loadGeneration.current) setError(message(cause)); }
    finally { setLoadingMoreEvents(false); }
  };
  const moreEntries = async () => {
    if (!preview || preview.kind !== "close" || entryOffset === null) return;
    const previewId = preview.data.preview_id;
    const offset = entryOffset;
    try {
      const page = await stocktakeApi.read<Page<Record<string, unknown>>>(`/api/stocktakes/close-previews/${previewId}/entries?offset=${offset}&limit=100`, token);
      if (previewIdRef.current === previewId && roundRef.current === round?.round_id) {
        setEntries(previous => [...previous, ...page.items]); setEntryOffset(page.next_offset ?? null);
      }
    } catch (cause) { if (previewIdRef.current === previewId && roundRef.current === round?.round_id) setError(message(cause)); }
  };

  const roundInfo = round && <StocktakeRoundHeader round={round} ariaLabel="조사 회차 정보" />;
  const closeEvidence = evidence && <section className={card}><h2 className="font-semibold">불변 종료 증빙</h2><dl className="mt-3 grid grid-cols-[80px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm"><dt className="text-[var(--c-muted2)]">종료 방식</dt><dd>{evidence.mode === "FULL" ? "전체 종료" : "부분 종료"}</dd><dt className="text-[var(--c-muted2)]">사유</dt><dd className="break-words">{String(evidence.reason || "없음")}</dd><dt className="text-[var(--c-muted2)]">승인자</dt><dd>{String(evidence.actor_name)}</dd><dt className="text-[var(--c-muted2)]">종료 시각</dt><dd>{formatKstDateTime(String(evidence.closed_at ?? ""))} KST</dd></dl></section>;
  const activity = !!round && <StocktakeActivityDisclosure title="최근 활동" includeSaves={includeSaves} onIncludeSavesChange={setIncludeSaves}>
    {loadingEvents ? <p role="status" className="py-3 text-[var(--c-muted2)]">활동을 불러오는 중입니다.</p> : events.length ? <StocktakeActivity events={events} admin={canManageStocktakeRounds(operator)} /> : !error && <p className="py-3 text-[var(--c-muted2)]">표시할 활동이 없습니다.</p>}
    {eventCursor && <button className={`${button} mt-2 w-full`} disabled={loadingEvents || loadingMoreEvents} onClick={() => void moreEvents()}>{loadingMoreEvents ? "불러오는 중…" : "활동 더 보기"}</button>}</StocktakeActivityDisclosure>;

  if (section === "rounds" && !canManageRounds) return null;
  return <div className="space-y-3 text-sm text-[var(--c-text)] empty:hidden" data-testid={`stocktake-management-${section}`}>
    {section === "progress" && notice && <p role="status" className="px-3 text-[var(--c-green)]">{notice}</p>}
    {error && (section === "progress" ? <div role="alert" className="rounded-xl border border-[var(--c-red)] bg-[var(--c-s1)] p-3 text-sm text-[var(--c-red)]"><p>{error}</p>{round && <button className={`${button} mt-2`} disabled={progressPending} onClick={() => void refresh()}>진행 현황 다시 불러오기</button>}</div> : <p role="alert" className="rounded-xl border border-[var(--c-red)] bg-[var(--c-s1)] p-3 text-sm text-[var(--c-red)]">{error}</p>)}
    {preparationIssues.length > 0 && <section aria-label="조사 대상 준비 보류" className={card}>
      <h3 className="text-sm font-semibold">조사 시작 전에 확인할 품목</h3>
      <ul className="mt-2 divide-y divide-[var(--c-border)]">{preparationIssues.map((issue, index) => <li key={index} className="py-3 text-sm">
        <p className="font-semibold">{issue.item_code || "코드 없음"} · {issue.item_name}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--c-muted2)]">{issue.scope_name || issue.scope_id} {issue.reason}</p>
      </li>)}</ul>
    </section>}
    {unknown && <div className={card}><p>명령 결과가 불확실합니다. 새 요청을 보내지 말고 같은 키의 영수증을 조회해 주세요.</p><button className={button} disabled={busy} onClick={() => void lookup()}>영수증 조회</button></div>}
    {section === "progress" ? round ? <StocktakeProgressPanel progress={progress ?? undefined} loading={!progress && progressPending} active={round.status === "ACTIVE"}
      workerQuantityMode={workerQuantityMode} onWorkerQuantityModeChange={setWorkerQuantityMode}
      roundInfo={roundInfo} evidence={closeEvidence} activity={activity} /> : <p className={card}>활성 회차가 없습니다.</p> : <>
      {canManageRounds && <StocktakeDisclosure title="회차 관리" defaultOpen variant="card" feedback={
        <div data-testid="stocktake-management-feedback" className="sg flex h-11 items-center justify-end overflow-y-auto text-right text-sm font-normal">
          {busy ? <p role="status" className="text-[var(--c-muted2)]">회차 관리 요청을 처리하는 중입니다.</p>
            : notice ? <p role="status" className="text-[var(--c-green)]">{notice}</p> : null}
        </div>}>
        <fieldset disabled={busy || !!unknown} className="min-w-0 space-y-3">
          {round?.status === "ACTIVE" && <nav aria-label="회차 관리 작업" className="grid w-full grid-cols-2 gap-4">
            {(["close", "append"] as const).map(kind => <button key={kind} type="button" className={button} style={action === kind ? { borderColor: "var(--c-blue)", color: "var(--c-blue)", background: "color-mix(in srgb, var(--c-blue) 10%, var(--c-s1))" } : undefined} aria-pressed={action === kind} onClick={() => { if (action === kind) return; setManagementAction(kind); setPreview(null); setError(""); setNotice(""); setPreparationIssues([]); }}>{kind === "close" ? "회차 종료" : "새 조사 대상 확인"}</button>)}
          </nav>}
          <div>
          <ManagementFields open={!preview && action === "start"}>
            <h2 className="mb-3 font-semibold">새 회차 시작</h2>
            <label className="block">회차 이름<input aria-label="회차 이름" autoFocus={focusStart} className={`${field} mt-2`} value={title} onChange={event => { setTitle(event.target.value); setPreview(null); }} /></label>
          </ManagementFields>
          <ManagementFields open={!preview && action === "append"}><p>현재 회차에 새 조사 대상을 추가합니다.</p></ManagementFields>
          <ManagementFields open={!preview && action === "close"}>
            <div className="space-y-3">
            <label className="block">종료 방식<select aria-label="종료 방식" className={`${field} mt-2`} value={mode} onChange={event => { setMode(event.target.value as "FULL" | "PARTIAL"); setPreview(null); }}><option value="FULL">전체 종료</option><option value="PARTIAL">부분 종료</option></select></label>
            <p className="text-xs leading-5 text-[var(--c-muted2)]">{mode === "FULL" ? "전체 종료: 반영 대기에서 모든 조사 위치의 재고 반영을 마친 뒤 종료합니다." : "부분 종료: 남은 조사 대상을 남기고 종료합니다."}</p>
            </div>
            <ManagementFields open={mode === "PARTIAL"}>
              <label className="block pt-3">종료 사유<textarea aria-label="종료 사유" className={`${field} mt-2`} value={reason} onChange={event => { setReason(event.target.value); setPreview(null); }} /></label>
            </ManagementFields>
          </ManagementFields>
          </div>
          {preview && <section aria-label="회차 관리 검토" className="space-y-3">
            <h2 className="font-semibold">{preview.kind === "close" ? "종료 검토" : preview.kind === "start" ? "회차 시작 검토" : "대상 추가 검토"}</h2>
            {preview.kind === "close" && <div className="space-y-2 rounded-xl border border-[var(--c-border)] bg-[var(--c-s2)] p-4">
              <p className={`font-semibold ${preview.data.can_close ? "text-[var(--c-green)]" : "text-[var(--c-red)]"}`}>{preview.data.can_close ? "회차를 종료할 수 있습니다." : "아직 회차를 종료할 수 없습니다."}</p>
              {preview.data.can_close && mode === "PARTIAL" ? <p>미완료 항목은 남기고, 재고를 변경하지 않은 채 종료합니다.</p>
                : preview.data.can_close ? <p>조사와 재고 반영이 끝났습니다. 아래 내용을 확인한 뒤 회차를 종료해 주세요.</p>
                  : <p>미확인 항목은 조사 담당자에게 확인을 요청해 주세요. 확인된 결과는 담당자가 ‘반영 대기’에서 반영해야 합니다.</p>}
              {!preview.data.can_close && mode === "FULL" && <p className="text-[var(--c-muted2)]">반영 대기에서 남은 조사 위치를 반영하거나 부분 종료를 선택해 주세요.</p>}
            </div>}
            {preview.kind === "close" && <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2"><dt className="text-[var(--c-muted2)]">종료 방식</dt><dd>{mode === "FULL" ? "전체 종료" : "부분 종료"}</dd>{reason.trim() && <><dt className="text-[var(--c-muted2)]">종료 사유</dt><dd className="break-words">{reason.trim()}</dd></>}</dl>}
            {preview.data.summary && <div className="space-y-2">
              <p className="text-[var(--c-muted2)]">전체 조사 위치 {preview.data.summary.total.toLocaleString("ko-KR")}곳</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {[{ label: "미확인", count: preview.data.summary.unconfirmed, unit: "곳", description: "아직 수량 확인이 끝나지 않았습니다." },
                  { label: "확인 후 미반영", count: preview.data.summary.confirmed_excluded, unit: "건", description: "확인한 수량이 재고에 반영되지 않았습니다." },
                  { label: "추가 대기", count: preview.data.summary.pending, unit: "건", description: "회차에 추가하지 않은 조사 대상입니다." }].map(value => <div key={value.label} className="rounded-xl bg-[var(--c-s2)] p-3">
                    <p className="font-semibold">{value.label} {value.count?.toLocaleString("ko-KR") ?? "—"}{value.unit}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--c-muted2)]">{value.description}</p>
                  </div>)}
              </div>
            </div>}
            {preview.kind !== "close" && <p>조사 대상 {preview.data.target_count ?? preview.data.count ?? "확인 필요"}건</p>}
            {preview.kind === "append" && preview.data.targets && <ul aria-label="추가할 조사 대상" className="sg max-h-60 overflow-y-auto divide-y divide-[var(--c-border)]">{preview.data.targets.map(target => <li key={`${target.item_id}:${target.scope_key}`} className="py-3"><p className="break-words">{target.item_name} · {target.scope_name}</p><p className="mt-1 text-xs text-[var(--c-muted2)]">{target.item_code}</p></li>)}</ul>}
            {preview.kind === "close" && <>
              {entries.some(hasCloseHold) && <section aria-label="재고 반영 전에 확인할 품목" className="space-y-3">
                <h3 className="font-semibold">재고 반영 전에 확인할 품목</h3>
                {preview.data.can_close && mode === "PARTIAL" && <p className="text-[var(--c-muted2)]">아래 수량 문제는 이번 부분 종료를 막지 않습니다. 해당 결과는 재고에 반영되지 않습니다.</p>}
                <ul className="space-y-3">{entries.filter(hasCloseHold).map((entry, index) => <CloseEntryRow key={`${String(entry.target_id)}-${index}`} entry={entry} partial={mode === "PARTIAL"} />)}</ul>
              </section>}
              <details><summary className="flex min-h-11 cursor-pointer items-center font-semibold">조사 대상별 결과</summary><p className="mb-2 text-xs text-[var(--c-muted2)]">품목과 조사 위치별 기록입니다.</p><ul className="space-y-2">{entries.filter(entry => !hasCloseHold(entry)).map((entry, index) => <CloseEntryRow key={`${String(entry.target_id)}-${index}`} entry={entry} partial={mode === "PARTIAL"} />)}</ul>{entryOffset !== null && <button className={`${button} mt-2`} onClick={() => void moreEntries()}>품목 더 보기</button>}</details>
              {!entriesReady && !error && <p role="status">종료 내용을 불러오는 중입니다.</p>}
            </>}
            <button type="button" className={button} onClick={() => { setPreview(null); setError(""); }}>입력으로 돌아가기</button>
          </section>}
          <button type="button" className={`${button} w-full`} style={{ borderColor: LEGACY_COLORS.blue, background: LEGACY_COLORS.blue, color: LEGACY_COLORS.white }} disabled={!!preview && (preview.kind === "close" && (!preview.data.can_close || !entriesReady))} onClick={() => void (preview ? submit() : action === "close" ? prepareClose() : action === "append" ? prepareAppend() : prepareStart())}>{preview ? (preview.kind === "close" ? "회차 종료" : preview.kind === "append" ? "현재 회차에 추가" : "회차 시작") : action === "close" ? "종료 내용 확인" : action === "append" ? "추가 대상 확인" : "시작 대상 확인"}</button>
        </fieldset>
      </StocktakeDisclosure>}
    </>}
  </div>;
}

/** Both reason-only and detailed holds need a visible explanation. */
function hasCloseHold(entry: Record<string, unknown>): boolean {
  return (Array.isArray(entry.held_details) && entry.held_details.length > 0) || (Array.isArray(entry.held_reasons) && entry.held_reasons.length > 0);
}

function CloseEntryRow({ entry, partial }: { entry: Record<string, unknown>; partial: boolean }): ReactNode {
  const quantities = entry.quantities && typeof entry.quantities === "object" ? entry.quantities as Record<string, number | null> : null;
  const details = Array.isArray(entry.held_details) ? entry.held_details as Array<{ category?: string; counted?: number; reserved?: number; total_after?: number; code: string }> : [];
  const holds: typeof details = [...details, ...(Array.isArray(entry.held_reasons) ? entry.held_reasons.filter(value => typeof value === "string" && !details.some(detail => detail.code === value)).map(code => ({ code: String(code) })) : [])];
  const classification = String(entry.classification ?? "");
  const label = { ALREADY_APPLIED: "재고 반영 완료", SELECTED_APPLY: "종료와 함께 반영", CONFIRMED_EXCLUDED: "확인 완료 · 재고 미반영", DRAFT: "계수 중", UNCOUNTED: "미확인", ABANDONED: "미확인", PENDING_UNADMITTED: "조사 대상 추가 대기" }[classification] ?? "상태 확인 필요";
  const unit = entry.unit ? ` ${String(entry.unit)}` : "";
  return <li className="space-y-3 rounded-xl border border-[var(--c-border)] p-4">
    <div><p className="break-words font-semibold">{String(entry.item_name ?? "품목명 없음")} · {String(entry.scope_name ?? "위치 확인 필요")}</p>
      <p className="mt-1 break-words text-xs text-[var(--c-muted2)]">{entry.item_code ? `${String(entry.item_code)} · ` : ""}{label} · 담당 {String(entry.owner_name || "미지정")}</p></div>
    {classification === "CONFIRMED_EXCLUDED" && <p>{partial ? "이 품목은 이번 부분 종료에서 재고에 반영되지 않습니다." : "담당자가 ‘반영 대기’에서 이 품목의 재고 반영을 완료해 주세요."}</p>}
    {holds.map((hold, index) => <div key={`${hold.code}-${index}`} className="space-y-2 rounded-lg bg-[var(--c-s2)] p-3">
      <p className="font-semibold text-[var(--c-yellow)]">{hold.code === "RESERVATION_SHORTAGE" ? "수량 확인이 필요합니다." : hold.code === "TOTAL_OUT_OF_RANGE" ? "재고 합계가 허용 범위를 벗어났습니다." : hold.code === "POOL_MISMATCH" ? "불량 재고의 분류별 수량이 서로 맞지 않습니다." : "재고 상태 확인이 필요합니다."}</p>
      {hold.code === "RESERVATION_SHORTAGE" && <p>확인한 수량보다 다른 작업에 예약된 수량이 많습니다.</p>}
      {typeof hold.counted === "number" && typeof hold.reserved === "number" && <p className="font-semibold">{hold.category ? `${CATEGORY_LABELS[hold.category as keyof typeof CATEGORY_LABELS] ?? "해당 재고"} · ` : ""}확인 수량 {hold.counted.toLocaleString("ko-KR")}{unit} · 예약 수량 {hold.reserved.toLocaleString("ko-KR")}{unit}</p>}
      {typeof hold.total_after === "number" && <p>예상 합계 {hold.total_after.toLocaleString("ko-KR")}{unit}</p>}
      <p className="text-[var(--c-muted2)]">{hold.code === "RESERVATION_SHORTAGE" ? "실제 수량을 다시 확인하고, 예약 내역은 담당자에게 확인을 요청해 주세요." : hold.code === "POOL_MISMATCH" ? "재고 담당자에게 불량·B급·구형 수량 확인을 요청해 주세요." : "입력한 조사 수량을 다시 확인하고, 재고 담당자에게 이 품목의 재고 내역 확인을 요청해 주세요."}</p>
    </div>)}
    {quantities && <details><summary className="flex min-h-11 cursor-pointer items-center text-xs text-[var(--c-muted2)]">조사 수량</summary>
      <p>조사 수량: 정상 {quantities.normal ?? "미입력"}, 불량 {quantities.defect ?? "미입력"}, B급 {quantities.b_grade ?? "미입력"}, 구형 {quantities.obsolete ?? "미입력"}{unit}</p>
    </details>}
  </li>;
}
