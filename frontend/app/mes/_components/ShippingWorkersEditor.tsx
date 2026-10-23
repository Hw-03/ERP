"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type ShippingRequest } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { queryKeys } from "@/lib/queries/keys";
import { normalizeWorkerNames } from "@/lib/shipping/request-draft";
import { useRegisterDirty } from "@/lib/ui/dirty-guard";

/** Native text inputs strip pasted newlines; keep separate names separated by spaces. */
export function ShippingWorkersInput({ value, onValueChange, ...props }: Omit<ComponentProps<"input">, "value" | "onChange" | "onPaste"> & { value: string; onValueChange: (value: string) => void }) {
  return <input {...props} value={value} onChange={(event) => onValueChange(event.target.value)} onPaste={(event) => {
    const pasted = event.clipboardData.getData("text");
    if (!/[\r\n]/.test(pasted)) return;
    event.preventDefault();
    const field = event.currentTarget;
    const next = value.slice(0, field.selectionStart ?? value.length) + pasted.replace(/[\r\n]+/g, " ") + value.slice(field.selectionEnd ?? value.length);
    onValueChange(next.slice(0, props.maxLength ?? 200));
  }} />;
}

/** Keep worker edits independent from invoice, BOM and preparation metadata. */
export function ShippingWorkersEditor({ request, onSaved }: { request: ShippingRequest; onSaved: (request: ShippingRequest) => void }) {
  const client = useQueryClient();
  const [value, setValue] = useState(request.worker_names ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previous = useRef({ id: request.request_id, workers: request.worker_names ?? "" });
  const latest = useRef(request);
  const savingRef = useRef(false);
  const mounted = useRef(true);
  latest.current = request;
  const editable = request.status === "PREPARING";
  const dirty = normalizeWorkerNames(value) !== normalizeWorkerNames(request.worker_names);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    const next = request.worker_names ?? "";
    if (previous.current.id !== request.request_id) {
      setValue(next);
      setError(null);
    } else if (previous.current.workers !== next && normalizeWorkerNames(value) === normalizeWorkerNames(previous.current.workers)) {
      setValue(next);
    }
    previous.current = { id: request.request_id, workers: next };
  }, [request.request_id, request.worker_names, value]);

  async function save(propagateError = false): Promise<void> {
    if (savingRef.current) {
      if (propagateError) throw new Error("작업자를 저장 중입니다. 잠시 후 다시 시도하세요.");
      return;
    }
    if (!dirty) return;
    if (!editable) {
      const cause = new Error("준비 중인 요청만 작업자를 수정할 수 있습니다.");
      setError(cause.message);
      if (propagateError) throw cause;
      return;
    }
    const normalized = normalizeWorkerNames(value);
    if ((normalized?.length ?? 0) > 200) {
      const cause = new Error("작업자는 200자 이내로 입력하세요.");
      setError(cause.message);
      if (propagateError) throw cause;
      return;
    }
    const id = request.request_id;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const saved = await api.updateShippingWorkers(id, normalized);
      if (!mounted.current || latest.current.request_id !== id) return;
      setValue(saved.worker_names ?? "");
      onSaved(saved);
      void client.invalidateQueries({ queryKey: queryKeys.shipping.revisions(id) });
      void client.invalidateQueries({ queryKey: queryKeys.stockRequests.all });
    } catch (cause) {
      if (mounted.current && latest.current.request_id === id) setError(cause instanceof Error ? cause.message : "작업자를 저장하지 못했습니다.");
      if (propagateError) throw cause;
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  useRegisterDirty(`shipping-workers-${request.request_id}`, dirty, () => save(true), () => { setValue(request.worker_names ?? ""); setError(null); }, { mode: editable ? "save" : "confirm-only" });

  return <section aria-label="작업자 정보" className="min-w-0 basis-[280px] grow">
    <div className="flex min-h-[64px] items-center gap-2 rounded-[14px] border px-3 py-2" style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border }}>
      <label className="min-w-0 flex-1"><span className="block text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>작업자</span>
        {editable ? <ShippingWorkersInput aria-label="작업자" value={value} maxLength={200} disabled={saving} onValueChange={setValue} placeholder="이름 입력 (여러 명 가능, 선택)" className="mt-1 min-h-11 w-full min-w-0 bg-transparent text-sm font-bold outline-none focus-visible:ring-2" style={{ color: LEGACY_COLORS.text }} />
          : <span className="mt-1 block break-words text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>{request.worker_names || "미입력"}</span>}
      </label>
      {editable && <button type="button" aria-label="작업자 저장" onClick={() => void save()} disabled={saving || !dirty} className="min-h-11 shrink-0 rounded-[12px] border px-4 text-sm font-bold disabled:opacity-45" style={{ background: tint(LEGACY_COLORS.blue, 14), borderColor: tint(LEGACY_COLORS.blue, 40), color: LEGACY_COLORS.blue }}>{saving ? "저장 중" : "저장"}</button>}
    </div>
    {!editable && dirty && <p className="mt-2 break-words text-sm" style={{ color: LEGACY_COLORS.yellow }}>저장하지 않은 입력: {value || "미입력"} · 준비 중 상태에서 저장할 수 있습니다.</p>}
    {error && <p role="alert" className="mt-2 text-sm" style={{ color: LEGACY_COLORS.red }}>{error}</p>}
  </section>;
}
