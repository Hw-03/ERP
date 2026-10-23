"use client";

import { useEffect, useState, type JSX } from "react";
import type { StockRequest } from "@/lib/api";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import { LEGACY_COLORS as C } from "@/lib/mes/color";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { StocktakePauseNotice } from "../common/StocktakePauseNotice";

type Decision = Record<string, unknown> & { children?: Decision[] | null };
const QUANTITY_LABELS: Record<string, string> = { qty: "전체 수량", normal_qty: "정상 수량", defective_qty: "불량 수량", scrap_qty: "폐기 수량", keep_qty: "유지 수량" };

function parseNotes(notes: string | null): Record<string, unknown> | null {
  try { const value: unknown = JSON.parse(notes ?? "null"); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
  catch { return null; }
}

/** 구형 요청도 원래 메타데이터와 분류 내용을 보존하여 동일 요청을 이어간다. */
export function LegacyDraftResumeDialog({ draft, onClose, onChanged }: { draft: StockRequest; onClose: () => void; onChanged: () => void }): JSX.Element {
  const [current, setCurrent] = useState(draft);
  const [quantities, setQuantities] = useState(draft.lines.map((line) => line.quantity));
  const [notes, setNotes] = useState(() => parseNotes(draft.notes));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pause = current.stocktake_pause;
  const decisions = Array.isArray(notes?.child_decisions) ? notes.child_decisions as Decision[] : null;
  const hasQuantity = quantities.some((quantity) => quantity > 0);
  useEffect(() => {
    setCurrent((previous) => ({ ...previous, stocktake_pause: draft.stocktake_pause }));
  }, [draft.stocktake_pause]);

  async function confirm(): Promise<void> {
    if (busy || pause && pause.state !== "ready") return;
    setBusy(true); setError(null);
    try {
      if (pause || dirty) {
        if (!hasQuantity || quantities.some((quantity) => !Number.isFinite(quantity) || quantity < 0)) throw new Error("수량은 0 이상이며 하나 이상 입력해야 합니다.");
        const saved = await stockRequestsApi.upsertStockRequestDraft({
          requester_employee_id: current.requester_employee_id, request_type: current.request_type,
          submission_id: current.submission_id, reference_no: current.reference_no,
          supplier_id: current.supplier_id, reason_category_id: current.reason_category_id,
          reason_category: current.reason_category, reason_memo: current.reason_memo,
          notes: notes ? JSON.stringify(notes) : current.notes,
          ...(pause ? { stocktake_resume_token: pause.token } : {}),
          lines: current.lines.flatMap((line, index) => quantities[index] > 0 ? [{
            item_id: line.item_id, quantity: quantities[index], record_id: line.record_id, pool_id: line.pool_id,
            from_bucket: line.from_bucket, from_department: line.from_department,
            to_bucket: line.to_bucket, to_department: line.to_department,
          }] : []),
        });
        setCurrent(saved); setQuantities(saved.lines.map((line) => line.quantity)); setNotes(parseNotes(saved.notes)); setDirty(false);
        if (pause) {
          await stockRequestsApi.submitStockRequestDraft(saved.request_id, saved.requester_employee_id);
          onClose();
        }
        onChanged();
      } else {
        await stockRequestsApi.submitStockRequestDraft(current.request_id, current.requester_employee_id);
        onChanged(); onClose();
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : "작업 처리에 실패했습니다."); onChanged(); }
    finally { setBusy(false); }
  }

  return <ConfirmModal open title="작업 내용" wide busy={busy} confirmLabel={!pause && dirty ? "작업 내용 반영" : "요청 제출"}
    confirmDisabled={Boolean(pause && pause.state !== "ready") || !hasQuantity} onClose={onClose} onConfirm={confirm}>
    <div className="space-y-3 text-sm leading-6" style={{ color: C.text }}>
      <StocktakePauseNotice pause={pause} />
      {current.lines.map((line, index) => <label key={line.line_id} className="flex min-h-11 items-center justify-between gap-3">
        <span>{line.item_name_snapshot}</span><input aria-label={`${line.item_name_snapshot} 수량`} type="number" min={0} step="any" disabled={busy} value={quantities[index]} className="min-h-11 w-28 rounded-[12px] border px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]" style={{ background: C.s1, borderColor: C.border }}
          onChange={(event) => { setQuantities((previous) => previous.map((quantity, i) => i === index ? Number(event.target.value) : quantity)); setDirty(true); }} />
      </label>)}
      {decisions && <DecisionInputs decisions={decisions} busy={busy} onChange={(value) => { setNotes((previous) => ({ ...previous, child_decisions: value })); setDirty(true); }} />}
      {error && <p role="alert" style={{ color: C.red }}>{error}</p>}
    </div>
  </ConfirmModal>;
}

function DecisionInputs({ decisions, onChange, busy }: { decisions: Decision[]; onChange: (decisions: Decision[]) => void; busy: boolean }): JSX.Element {
  return <div className="space-y-3 border-l pl-3" style={{ borderColor: C.border }}>{decisions.map((decision, index) => {
    const name = String(decision.item_name ?? decision.item_id ?? "구성품");
    const change = (next: Decision): void => onChange(decisions.map((value, i) => i === index ? next : value));
    return <div key={index} className="space-y-2"><p className="font-semibold">{name}</p><div className="grid grid-cols-2 gap-2">
      {Object.entries(QUANTITY_LABELS).filter(([key]) => key in decision).map(([key, label]) => <label key={key} className="text-xs">{label}<input type="number" min={0} step="any" aria-label={`${name} ${label}`} disabled={busy} value={Number(decision[key])} className="mt-1 min-h-11 w-full rounded-[12px] border px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]" style={{ background: C.s1, borderColor: C.border }} onChange={(event) => change({ ...decision, [key]: Number(event.target.value) })} /></label>)}
      </div>{Array.isArray(decision.children) && <DecisionInputs decisions={decision.children} busy={busy} onChange={(children) => change({ ...decision, children })} />}</div>;
  })}</div>;
}
