"use client";

import { canManageStocktakeRounds } from "./stocktakeAuthority";

import { Fragment, useEffect, useReducer, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isStocktakeNotApplied, stocktakeApi } from "@/lib/api/stocktake";
import { restoreOperatorSession } from "@/lib/auth/operator-session";
import { useRegisterDirty } from "@/lib/ui/dirty-guard";
import { readCurrentOperator, type Operator } from "../login/useCurrentOperator";
import { CATEGORIES, CountDraft, type DraftCount } from "./countDraft";
import type { StocktakeTarget } from "@/lib/api/types/stocktake";
import type { RecoveredStocktakeCommand } from "./StocktakeCommandRecovery";
import { StocktakeItemPhoto } from "./StocktakeItemPhoto";
import { DesktopRightPanelFooter } from "../DesktopRightPanel";
import { formatQty } from "@/lib/mes/format";
import { formatKstDateTime } from "@/lib/mes-format";
import { getManagedStockBreakdown } from "../_inventory_sections/inventoryManagedStock";

export const CATEGORY_LABELS = { normal: "정상", defect: "불량", b_grade: "B급", obsolete: "구형" } as const;
export const STOCKTAKE_BUTTON = "min-h-11 rounded-xl border border-[var(--c-border)] px-4 py-2 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50";
export const STOCKTAKE_INPUT = "min-h-11 w-full rounded-xl border border-[var(--c-border)] bg-[var(--c-s2)] p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-blue)]";
export const STOCKTAKE_CARD = "card desktop-flat-surface rounded-[20px] border border-[var(--c-border)] bg-[var(--c-s1)] p-4 lg:rounded-[24px]";

/** Preserve the editor instance across list refreshes; only changing the count remounts it. */
export function StocktakeCountEditor({ target, token, operator, onChanged, enabled = true, recovered, imageFilename, presentation = "card" }: {
  target: StocktakeTarget; token: string; operator: Operator; onChanged: () => void; enabled?: boolean; recovered?: RecoveredStocktakeCommand | null; imageFilename?: string; presentation?: "card" | "panel";
}) {
  const initial = target.count!;
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const [, repaint] = useReducer((n: number) => n + 1, 0);
  const [draft] = useState(() => new CountDraft({ ...initial, status: target.status },
    (body, key) => stocktakeApi.command<DraftCount>("count_save", `/api/stocktakes/counts/${initial.count_id}`, tokenRef.current, body, { key, method: "PATCH" }),
    () => enabledRef.current && readCurrentOperator()?.employee_id === initial.owner_id && !!restoreOperatorSession(initial.owner_id)));
  const [reason, setReason] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeAction, setActiveAction] = useState<"count_confirm" | "count_resume" | "count_abandon" | "count_force_release" | null>(null);
  const busyRef = useRef(false);
  const [unknown, setUnknown] = useState<{ kind: "count_confirm" | "count_resume" | "count_abandon" | "count_force_release"; key: string } | null>(null);
  const queryClient = useQueryClient();
  const countQuery = useQuery({
    queryKey: ["stocktake", operator.employee_id, "count", initial.count_id],
    queryFn: ({ signal }) => stocktakeApi.read<DraftCount>(`/api/stocktakes/counts/${initial.count_id}`, token, { signal }),
    retry: false,
    enabled,
  });
  useEffect(() => draft.subscribe(repaint), [draft]);
  const handledRecovery = useRef<RecoveredStocktakeCommand | null>(null);
  useEffect(() => {
    if (!recovered || handledRecovery.current === recovered || recovered.token !== token || !enabled) return;
    handledRecovery.current = recovered;
    if (recovered.entry.key === draft.pendingKey && recovered.entry.kind === "count_save") {
      if (recovered.resolution === "NOT_APPLIED") draft.resolveNotApplied(recovered.entry.key);
      else draft.resolveReceipt(recovered.result as DraftCount);
      setActionError("");
    } else if (unknown?.key === recovered.entry.key && unknown.kind === recovered.entry.kind) {
      if (recovered.resolution === "COMPLETED") { draft.receive(recovered.result as DraftCount); draft.acceptServer(); }
      setUnknown(null); setActionError("");
    }
  }, [recovered, draft, token, enabled, unknown]);
  useEffect(() => { draft.receive({ ...target.count!, status: target.status }); }, [draft, target.count, target.status]);
  useEffect(() => { if (countQuery.data) draft.receive(countQuery.data); }, [draft, countQuery.data]);
  useEffect(() => {
    if (!enabled || !draft.dirty || draft.saving || draft.error || busy || unknown) return;
    const timer = window.setTimeout(() => {
      void draft.flush().then(() => queryClient.setQueryData(["stocktake", operator.employee_id, "count", initial.count_id], draft.count)).catch(() => {});
    }, 700);
    return () => window.clearTimeout(timer);
  });
  useRegisterDirty(`stocktake-${initial.count_id}`, draft.dirty || draft.saving || busy || !!unknown,
    async () => {
      if (unknown || busyRef.current) throw new Error("처리 결과를 먼저 확인해 주세요.");
      await draft.flush();
    }, undefined, { mode: "auto-save", warnOnUnload: true });

  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ["stocktake"] }); onChanged(); };
  const command = async (kind: "count_confirm" | "count_resume" | "count_abandon" | "count_force_release") => {
    if (busyRef.current || unknown) return;
    busyRef.current = true; setBusy(true); setActiveAction(kind); setActionError("");
    const key = crypto.randomUUID();
    let commandStarted = false;
    try {
      if (kind === "count_confirm") await draft.flush();
      if (draft.ambiguous || draft.remote) throw new Error("저장 결과와 서버 변경을 먼저 확인해 주세요.");
      const suffix = { count_confirm: "confirm", count_resume: "resume", count_abandon: "abandon", count_force_release: "force-release" }[kind];
      const payload = { expected_version: draft.count.version, fence: draft.count.fence,
        ...(kind === "count_confirm" ? {} : { reason_code: kind === "count_resume" ? "RECOUNT_EDIT" : "OPERATOR_REQUEST", reason: kind === "count_abandon" ? "본인 계수 작업 중단" : reason }) };
      commandStarted = true;
      const result = await stocktakeApi.command<DraftCount>(kind, `/api/stocktakes/counts/${initial.count_id}/${suffix}`, tokenRef.current, payload,
        { key, ...(kind === "count_force_release" ? { adminPin } : {}) });
      // Abandon explicitly discards unsaved text; the immutable event retains the stored version.
      draft.receive(result);
      if (kind !== "count_confirm") draft.acceptServer();
      setReason(""); refresh();
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : "처리하지 못했습니다.");
      if (commandStarted && ((failure as { code?: string })?.code === "COMMAND_RESULT_UNKNOWN"
          || (failure as { extra?: { command_pending?: boolean } })?.extra?.command_pending === true)) setUnknown({ kind, key });
      void countQuery.refetch();
    } finally { setAdminPin(""); busyRef.current = false; setBusy(false); setActiveAction(null); }
  };
  const recover = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setActionError("");
    try {
      const commandKey = unknown?.key ?? draft.pendingKey;
      const kind = unknown?.kind ?? "count_save";
      if (!commandKey) return;
      const result = await stocktakeApi.read<DraftCount>(`/api/stocktakes/commands/${encodeURIComponent(commandKey)}?kind=${kind}`, tokenRef.current);
      if (unknown) { draft.receive(result); draft.acceptServer(); setUnknown(null); }
      else draft.resolveReceipt(result);
      refresh();
    } catch (failure) {
      if (isStocktakeNotApplied(failure)) {
        if (unknown) setUnknown(null);
        else if (draft.pendingKey) draft.resolveNotApplied(draft.pendingKey);
        setActionError("미반영으로 확정된 요청입니다. 입력을 보존했습니다."); refresh();
      } else setActionError("성공 영수증을 아직 확인하지 못했습니다. 입력을 보존했으며 다시 전송하지 않았습니다.");
    }
    finally { busyRef.current = false; setBusy(false); }
  };
  const owner = initial.owner_id === operator.employee_id;
  const historical = draft.count.status !== "DRAFT";
  const editable = enabled && owner && draft.count.status === "DRAFT" && !draft.remote && !draft.ambiguous && !unknown;
  const Actions = presentation === "panel" ? DesktopRightPanelFooter : Fragment;
  const inventory = target.current_inventory;
  const currentQuantities = inventory ? {
    normal: target.scope_id === "warehouse" ? Number(inventory.warehouse_qty)
      : inventory.locations.filter(location => location.department === target.scope_name && location.status !== "DEFECTIVE")
        .reduce((sum, location) => sum + Number(location.quantity), 0),
    defect: 0, b_grade: 0, obsolete: 0,
  } : null;
  if (inventory && currentQuantities) {
    for (const entry of getManagedStockBreakdown(inventory)) {
      if (entry.department === target.scope_name) {
        currentQuantities[entry.management_category.toLowerCase() as "defect" | "b_grade" | "obsolete"] += Number(entry.quantity);
      }
    }
  }
  return <section className={`${presentation === "panel" ? "rounded-[28px] border border-[var(--c-border)] bg-[var(--c-s2)] p-5" : STOCKTAKE_CARD} flex flex-1 flex-col`} aria-label={historical ? "이전 조사 결과" : "계수 입력"}>
    {presentation === "card" && !historical ? <div className="flex items-center gap-3"><StocktakeItemPhoto filename={imageFilename} name={target.current_item_name || target.item_name} /><div className="min-w-0"><h2 className="break-words text-lg font-semibold">{target.current_item_name || target.item_name}</h2>
      <p className="mt-1 break-all text-xs text-[var(--c-muted2)]">{target.current_item_code || target.item_code}</p></div></div> : null}
    {historical && <header className={`mb-3 flex gap-x-3 gap-y-1 ${presentation === "card" ? "flex-col" : "flex-wrap items-center justify-between"}`}>
      <h2 className="text-sm font-semibold leading-5">이전 조사 결과</h2>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-[var(--c-muted2)]">
        <span aria-label="이전 조사 담당자">{target.confirmed_name || draft.count.owner_name || initial.owner_name}</span>
        <time aria-label="이전 조사 시각" dateTime={draft.count.confirmed_at || undefined}>{draft.count.confirmed_at ? formatKstDateTime(draft.count.confirmed_at) : "시각 기록 없음"}</time>
      </div>
    </header>}
    <div className={`${presentation === "card" && !historical ? "mt-4 " : ""}grid grid-cols-2 gap-3`}>{CATEGORIES.map((category) => <label key={category} className={historical && presentation === "card" ? "m-0 block rounded-xl border border-[var(--c-border)] bg-[var(--c-s1)] p-3 text-sm font-semibold" : "space-y-2 text-sm font-semibold"}>
      <span className="flex flex-wrap items-center justify-between gap-1">
        <span>{CATEGORY_LABELS[category]}</span>
        <span className="text-xs font-medium text-[var(--c-muted2)]"
          aria-label={`${target.scope_name} ${CATEGORY_LABELS[category]} 현재 재고 ${currentQuantities ? formatQty(currentQuantities[category]) : "확인 필요"}`}>
          현재 {currentQuantities ? formatQty(currentQuantities[category]) : "—"}
        </span>
      </span>
      {historical ? <div aria-label={`${CATEGORY_LABELS[category]} 조사 수량`} className={presentation === "card" ? "mt-2 text-xl leading-7 tabular-nums" : "rounded-xl bg-[var(--c-s1)] p-3 text-base tabular-nums"}>{draft.count.quantities[category] === null ? "미확인" : formatQty(draft.count.quantities[category]!)}</div> : <input aria-label={`${CATEGORY_LABELS[category]} 수량`} className={STOCKTAKE_INPUT} inputMode="numeric" autoComplete="off" placeholder="미확인"
        value={draft.values[category]} readOnly={!editable} disabled={!owner || busy} onChange={(event) => draft.edit(category, event.target.value)} />}
    </label>)}</div>
    {draft.error && <p aria-live="polite" className="mt-3 rounded-xl bg-[var(--c-s2)] p-3 text-sm text-[var(--c-red)]">저장 확인 필요</p>}
    {(draft.error || actionError || countQuery.error) && <p role="alert" className="mt-3 text-sm text-[var(--c-red)]">{actionError || draft.error?.message || countQuery.error?.message}</p>}
    {draft.remote && <div className="mt-3 rounded-xl bg-[var(--c-warning-bg)] p-3 text-sm">
      <p>서버 버전 {draft.remote.version} · {draft.remote.status}</p>
      <p>{CATEGORIES.map((key) => `${CATEGORY_LABELS[key]} ${draft.remote!.quantities[key] ?? "미확인"}`).join(" / ")}</p>
      <p className="mt-2">내 입력은 위에 보존되어 있습니다. 서버 값으로 바꾸면 내 미저장 입력을 버립니다.</p>
      <button type="button" className={`${STOCKTAKE_BUTTON} mt-2`} disabled={draft.ambiguous || busy} onClick={() => draft.acceptServer()}>내 입력을 버리고 서버 값 사용</button>
    </div>}
    {owner && ["DRAFT", "CONFIRMED"].includes(draft.count.status) && !unknown && !draft.ambiguous && <div className="mt-4">
      {draft.count.status === "CONFIRMED" && <p className="mb-2 text-xs text-[var(--c-muted2)]">작업을 중단하면 확인 결과가 취소됩니다.</p>}
      <button type="button" className={STOCKTAKE_BUTTON} disabled={busy || draft.saving} aria-busy={activeAction === "count_abandon"} onClick={() => void command("count_abandon")}>{activeAction === "count_abandon" ? "처리 중…" : "작업 중단"}</button>
    </div>}
    {(canManageStocktakeRounds(operator) || (owner && draft.count.status === "CONFIRMED")) && ["DRAFT", "CONFIRMED"].includes(draft.count.status) && !unknown && !draft.ambiguous && <details className={`${presentation === "panel" ? "mt-auto" : "mt-4"} shrink-0 rounded-xl border border-[var(--c-border)] px-3`}>
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">{owner && draft.count.status === "CONFIRMED" ? "확인 취소·수정 재개" : "관리자 잠금 해제"}</summary>
      <div className="space-y-3 pb-3">
      <label className="block text-sm">변경 사유<input aria-label="해제 사유" className={`${STOCKTAKE_INPUT} mt-2`} value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} /></label>
      {canManageStocktakeRounds(operator) && <label className="block text-sm">강제해제용 관리자 PIN<input aria-label="강제해제 관리자 PIN" type="password" autoComplete="off" className={`${STOCKTAKE_INPUT} mt-2`} value={adminPin} onChange={(e) => setAdminPin(e.target.value)} /></label>}
      <div className="flex flex-wrap gap-2">
        {owner && draft.count.status === "CONFIRMED" && <button type="button" className={STOCKTAKE_BUTTON} disabled={busy || !reason.trim()} onClick={() => void command("count_resume")}>확인 취소·수정 재개</button>}
        {canManageStocktakeRounds(operator) && <button type="button" className={`${STOCKTAKE_BUTTON} text-[var(--c-red)]`} disabled={busy || !reason.trim() || !adminPin} onClick={() => void command("count_force_release")}>관리자 잠금 해제</button>}
      </div>
      <p className="text-xs text-[var(--c-muted2)]">포기·해제는 저장된 계수와 사유를 이력에 남깁니다. 실재고는 바꾸지 않습니다.</p>
      </div>
    </details>}
    <Actions><div className={presentation === "panel" ? "bg-[var(--c-s1)]" : "sticky bottom-0 mt-auto bg-[var(--c-s1)] pt-4"}>
      {(draft.ambiguous || unknown) ? <button type="button" className={`${STOCKTAKE_BUTTON} w-full text-[var(--c-red)]`} disabled={busy} onClick={() => void recover()}>처리 결과 확인</button> : editable && <>
        <div className="mb-2 flex flex-wrap gap-2">
          <button type="button" className={`${STOCKTAKE_BUTTON} flex-1 px-2`} disabled={busy} onClick={() => CATEGORIES.forEach((key) => { if (draft.values[key] === "") draft.edit(key, "0"); })}>미확인을 0으로 입력</button>
          {draft.error && <button type="button" className={`${STOCKTAKE_BUTTON} px-3`} disabled={busy || draft.saving} onClick={() => void draft.flush().then(refresh).catch(() => {})}>저장 다시 시도</button>}
        </div>
        <button type="button" className={`${STOCKTAKE_BUTTON} w-full bg-[var(--c-blue)] text-white`} disabled={busy || CATEGORIES.some((key) => draft.values[key] === "")} onClick={() => void command("count_confirm")}>계수 확인</button>
      </>}
    </div></Actions>
  </section>;
}
