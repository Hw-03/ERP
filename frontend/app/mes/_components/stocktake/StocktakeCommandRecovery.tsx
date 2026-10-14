"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isStocktakeCommandInFlight, listPendingStocktakeCommands, recoverStocktakeCommand, resolveStocktakeCommand, retryStocktakeCommand,
  stocktakeCommandRequiresAdmin, stocktakeCommandRequiresRoundManager, subscribePendingStocktakeCommands, type PendingStocktakeCommand } from "@/lib/api/stocktake";
import { ApiError } from "@/lib/api-core";
import { useRegisterDirty } from "@/lib/ui/dirty-guard";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { formatKstDateTime } from "@/lib/mes-format";

export type RecoveredStocktakeCommand = {
  token: string; entry: PendingStocktakeCommand; resolution: "COMPLETED" | "NOT_APPLIED"; result?: unknown;
};
const button = "min-h-11 rounded-xl border border-[var(--c-border)] px-4 py-2 text-sm disabled:opacity-50";
const field = "mt-1 min-h-11 w-full rounded-xl border border-[var(--c-border)] bg-[var(--c-s2)] p-2";
const requestLabels: Partial<Record<PendingStocktakeCommand["kind"], string>> = {
  target_append_preview: "새 조사 대상 확인", target_append: "현재 회차에 대상 추가",
  round_start_preview: "회차 시작 대상 확인", round_start: "회차 시작", round_close_preview: "회차 종료 내용 확인", round_close: "회차 종료",
  count_start: "조사 시작", count_save: "계수 저장", count_confirm: "계수 확인", count_resume: "조사 수정 재개", count_abandon: "작업 중단", count_force_release: "관리자 잠금 해제",
  application_preview: "재고 반영 내용 확인", application_apply: "재고 반영", application_bulk_preview: "일괄 반영 내용 확인", application_bulk_apply: "일괄 재고 반영",
  correction_request: "보정 요청", correction_preview: "보정 내용 확인", correction_approve: "보정 승인", correction_reject: "보정 반려", correction_withdraw: "보정 요청 철회",
};

/** Recover durable commands explicitly without replacing their original request identity. */
export function StocktakeCommandRecovery({ token, enabled, onRecovered, canManageRounds = false }: {
  token: string; enabled: boolean; canManageRounds?: boolean; onRecovered: (outcome: RecoveredStocktakeCommand) => void;
}) {
  const [{ pending, recoverable }, setCommands] = useState<{ pending: PendingStocktakeCommand[]; recoverable: PendingStocktakeCommand[] }>({ pending: [], recoverable: [] });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const actorRef = useRef({ token, enabled });
  actorRef.current = { token, enabled };
  const reload = useCallback(async () => {
    if (!enabled) return;
    const request = ++generation.current;
    const current = () => request === generation.current && actorRef.current.token === token && actorRef.current.enabled;
    try {
      const rows = await listPendingStocktakeCommands(token);
      if (current()) {
        // Keep both lists from one read: delivery ending must not reveal an old, cleared record.
        setCommands({ pending: rows, recoverable: rows.filter(entry => !isStocktakeCommandInFlight(entry)) });
        setError("");
      }
    }
    catch (failure) { if (current()) setError(failure instanceof Error ? failure.message : "복구 기록을 읽을 수 없습니다."); }
  }, [token, enabled]);
  useEffect(() => {
    setCommands({ pending: [], recoverable: [] }); setError(""); setNotice(""); setPin(""); setReason(""); setOpen(false);
    void reload();
    const unsubscribe = subscribePendingStocktakeCommands(() => { void reload(); });
    return () => { generation.current += 1; unsubscribe(); };
  }, [reload]);
  useRegisterDirty("stocktake-recovery", enabled && (pending.length > 0 || !!error || busy), async () => {
    if (busyRef.current) throw new Error("저장된 요청의 처리 결과를 먼저 확인해 주세요.");
    // The save may have settled before its asynchronous journal notification rendered.
    const rows = await listPendingStocktakeCommands(token);
    if (busyRef.current || actorRef.current.token !== token || !actorRef.current.enabled || rows.length) {
      throw new Error("저장된 요청의 처리 결과를 먼저 확인해 주세요.");
    }
    generation.current += 1;
    setCommands({ pending: [], recoverable: [] }); setError("");
  }, undefined, { mode: "auto-save", warnOnUnload: true });

  const recover = async (entry: PendingStocktakeCommand, action: "lookup" | "retry" | "resolve") => {
    if (busyRef.current || !enabled) return;
    if (action !== "lookup" && stocktakeCommandRequiresRoundManager(entry.kind) && !canManageRounds) return;
    busyRef.current = true; setBusy(true); setError(""); setNotice("");
    const current = () => actorRef.current.token === token && actorRef.current.enabled;
    const complete = async (resolution: "COMPLETED" | "NOT_APPLIED", result?: unknown) => {
      if (!current()) return;
      await reload();
      if (!current()) return;
      const emptyAppend = entry.kind === "target_append_preview" && !!result && typeof result === "object" && "no_targets" in result && result.no_targets === true;
      setNotice(resolution === "NOT_APPLIED" ? "미반영으로 확정했습니다. 이 요청은 이후에도 실행되지 않습니다." : emptyAppend ? "추가할 조사 대상이 없습니다." : "원래 요청의 완료 결과를 확인했습니다.");
      onRecovered({ token, entry, resolution, result });
    };
    try {
      if (action === "resolve") {
        const result = await resolveStocktakeCommand(token, entry.kind, entry.key, reason, pin || undefined);
        await complete(result.resolution, result.result);
      } else {
        const result = action === "retry" ? await retryStocktakeCommand(token, entry.kind, entry.key, pin || undefined)
          : await recoverStocktakeCommand(token, entry.kind, entry.key);
        await complete("COMPLETED", result);
      }
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === "COMMAND_NOT_APPLIED" && failure.extra?.definitive === true
          && typeof failure.extra.receipt_id === "string") await complete("NOT_APPLIED");
      else if (current()) setError(action === "lookup" ? "성공 기록을 아직 확인하지 못했습니다. 요청을 보존했습니다. 결과를 다시 확인하거나 같은 요청 재시도·정리를 선택해 주세요."
        : failure instanceof Error ? failure.message : "요청을 보존했습니다. 결과를 다시 확인해 주세요.");
    } finally { busyRef.current = false; setBusy(false); if (current()) setPin(""); }
  };
  if (!enabled || (!recoverable.length && !error && !notice)) return null;
  return <section aria-label="미확인 요청 복구" className="flex flex-wrap items-center gap-2">
    {recoverable.length > 0 && <button type="button" aria-haspopup="dialog" className={`${button} text-[var(--c-yellow)]`} onClick={() => setOpen(true)}>확인할 요청 {recoverable.length}건</button>}
    <ConfirmModal open={open} title="확인할 요청" viewer wide busy={busy} cancelLabel="닫기" onClose={() => { if (!busyRef.current) setOpen(false); }}>
      <div className="sg max-h-[60vh] overflow-x-hidden overflow-y-auto pr-2">
      <p className="mb-3 text-sm text-[var(--c-muted2)]">완료 여부를 확인하지 못한 요청입니다. 먼저 결과를 확인해 주세요. 요청 정리는 완료된 업무를 취소하지 않습니다.</p>
      {recoverable.some(entry => stocktakeCommandRequiresAdmin(entry.kind)) && <label className="block text-sm">복구 관리자 PIN<input type="password" autoComplete="off" value={pin} onChange={event => setPin(event.target.value)} className={field} /></label>}
      <label className="my-3 block text-sm">요청 정리 사유<input value={reason} maxLength={1000} onChange={event => setReason(event.target.value)} className={field} /></label>
      {recoverable.map(entry => <div key={`${entry.kind}:${entry.key}`} className="mt-3">
        <h3 className="text-sm font-semibold">{requestLabels[entry.kind] ?? "전수조사 작업"}</h3>
        {entry.created_at && <p className="mt-1 text-xs text-[var(--c-muted2)]">{formatKstDateTime(entry.created_at)} KST</p>}
        <details className="mb-2"><summary className="flex min-h-11 cursor-pointer items-center text-xs text-[var(--c-muted2)]">상세 정보</summary><p className="break-all text-xs text-[var(--c-muted2)]">{entry.kind} · 요청 {entry.key}</p></details>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} className={button} onClick={() => void recover(entry, "lookup")}>저장된 요청 결과 확인</button>
          <button type="button" disabled={busy || (stocktakeCommandRequiresRoundManager(entry.kind) && !canManageRounds) || (stocktakeCommandRequiresAdmin(entry.kind) && !pin)} className={button} onClick={() => void recover(entry, "retry")}>같은 요청 재시도</button>
          <button type="button" disabled={busy || !reason.trim() || (stocktakeCommandRequiresRoundManager(entry.kind) && !canManageRounds) || (stocktakeCommandRequiresAdmin(entry.kind) && !pin)} className={button} onClick={() => void recover(entry, "resolve")}>미확인 요청 정리</button>
        </div>
        {stocktakeCommandRequiresRoundManager(entry.kind) && !canManageRounds && <p className="mt-2 text-xs text-[var(--c-muted2)]">이 요청의 재시도와 정리에는 부서 정·부 담당자 권한이 필요합니다.</p>}
      </div>)}
      </div>
      {notice && <p role="status" className="mt-2 text-sm">{notice}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-[var(--c-red)]">{error}</p>}
    </ConfirmModal>
    {!open && notice && <p role="status" className="text-sm">{notice}</p>}
    {!open && error && <p role="alert" className="text-sm text-[var(--c-red)]">{error}</p>}
  </section>;
}
