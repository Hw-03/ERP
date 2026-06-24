"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { Button } from "@/lib/ui/Button";
import { Toast, type ToastState } from "@/lib/ui/Toast";
import { api, type Item } from "@/lib/api";
import type { Handover } from "@/lib/api/types";

const RECEIVE_DEPARTMENTS = ["고압", "진공"];
const DRAFT_TITLE_PLACEHOLDER = "(작성 중)";

interface DraftLine {
  item_id: string;
  item_name: string;
  mes_code: string | null;
  quantity: number;
}

export function HandoverComposeForm({
  authorEmployeeId,
  items,
  draft = null,
  onCreated,
  onDraftSaved,
}: {
  authorEmployeeId: string;
  items: Item[];
  /** 이어쓰기 대상 draft (없으면 신규 작성). key 로 remount 해 초기값을 재설정한다. */
  draft?: Handover | null;
  onCreated: () => void;
  /** 임시저장 직후 — 목록 갱신용 (탭은 그대로 유지). */
  onDraftSaved?: () => void;
}) {
  const [title, setTitle] = useState(
    draft ? (draft.title === DRAFT_TITLE_PLACEHOLDER ? "" : draft.title) : "튜브 인수인계서",
  );
  const [toDepartment, setToDepartment] = useState(draft?.to_department || RECEIVE_DEPARTMENTS[0]);
  const [productName, setProductName] = useState(draft?.product_name ?? "");
  const [processContent, setProcessContent] = useState(
    draft ? (draft.process_content ?? "") : "튜브 인수인계",
  );
  const [analysisText, setAnalysisText] = useState(draft?.analysis_text ?? "");
  const [notes, setNotes] = useState(draft?.notes ?? "");
  const [lines, setLines] = useState<DraftLine[]>(
    (draft?.lines ?? []).map((l) => ({
      item_id: l.item_id,
      item_name: l.item_name_snapshot,
      mes_code: l.mes_code_snapshot,
      quantity: l.quantity,
    })),
  );
  const [draftId, setDraftId] = useState<string | null>(draft?.handover_id ?? null);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  // 인수인계 대상은 튜브 TF 품목. 코드에 "TF" 가 포함된 품목만 선택지로 노출하고,
  // 이미 추가한 품목은 제외.
  const available = useMemo(
    () =>
      items.filter(
        (it) =>
          (it.mes_code ?? "").toUpperCase().includes("TF") &&
          !lines.some((l) => l.item_id === it.item_id),
      ),
    [items, lines],
  );

  function addLine(it: Item) {
    setLines((prev) => [
      ...prev,
      { item_id: it.item_id, item_name: it.item_name, mes_code: it.mes_code, quantity: 1 },
    ]);
  }

  function addSelected() {
    const it = items.find((i) => i.item_id === selectedItemId);
    if (!it) return;
    addLine(it);
    setSelectedItemId("");
  }

  function setQty(itemId: string, qty: number) {
    setLines((prev) =>
      prev.map((l) => (l.item_id === itemId ? { ...l, quantity: Math.max(1, Math.floor(qty) || 1) } : l)),
    );
  }

  function removeLine(itemId: string) {
    setLines((prev) => prev.filter((l) => l.item_id !== itemId));
  }

  const canSubmit = !!authorEmployeeId && title.trim().length > 0 && lines.length > 0 && !busy;
  // 임시저장은 인수 부서만 정해지면 가능 (품목/제목은 작성 중이어도 OK).
  const canSaveDraft = !!authorEmployeeId && !busy;

  function draftPayload() {
    return {
      handover_id: draftId,
      author_employee_id: authorEmployeeId,
      to_department: toDepartment,
      title: title.trim() || null,
      process_content: processContent.trim() || null,
      product_name: productName.trim() || null,
      analysis_text: analysisText.trim() || null,
      notes: notes.trim() || null,
      lines: lines.map((l) => ({ item_id: l.item_id, quantity: l.quantity })),
    };
  }

  async function saveDraft() {
    if (!canSaveDraft) return;
    setBusy(true);
    try {
      const saved = await api.saveHandoverDraft(draftPayload());
      setDraftId(saved.handover_id);
      setToast({ message: "임시저장했습니다. 나중에 이어서 작성할 수 있습니다.", type: "success" });
      onDraftSaved?.();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "임시저장 중 오류가 발생했습니다.",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      if (draftId) {
        // 임시저장본을 최신 내용으로 갱신 후 제출.
        await api.saveHandoverDraft(draftPayload());
        await api.submitHandover(draftId, { author_employee_id: authorEmployeeId });
      } else {
        await api.createHandover({
          author_employee_id: authorEmployeeId,
          to_department: toDepartment,
          title: title.trim(),
          process_content: processContent.trim() || null,
          product_name: productName.trim() || null,
          analysis_text: analysisText.trim() || null,
          notes: notes.trim() || null,
          lines: lines.map((l) => ({ item_id: l.item_id, quantity: l.quantity })),
        });
      }
      setToast({ message: "인수인계서를 제출했습니다.", type: "success" });
      setLines([]);
      setAnalysisText("");
      setNotes("");
      setDraftId(null);
      onCreated();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "제출 중 오류가 발생했습니다.",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  const fieldStyle = {
    background: LEGACY_COLORS.s2,
    borderColor: LEGACY_COLORS.border,
    color: LEGACY_COLORS.text,
  };

  return (
    <div
      className="flex flex-col gap-4 rounded-[18px] border p-5"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Field label="제목">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-[12px] border px-3 py-2 text-sm outline-none"
            style={fieldStyle}
          />
        </Field>
        <Field label="인수 부서">
          <select
            value={toDepartment}
            onChange={(e) => setToDepartment(e.target.value)}
            className="w-full rounded-[12px] border px-3 py-2 text-sm outline-none"
            style={fieldStyle}
          >
            {RECEIVE_DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="제품명 / 적용 범위">
          <input
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="예: 70 KV Filament Tube (DXDR-70)"
            className="w-full rounded-[12px] border px-3 py-2 text-sm outline-none"
            style={fieldStyle}
          />
        </Field>
        <Field label="공정 내용">
          <input
            value={processContent}
            onChange={(e) => setProcessContent(e.target.value)}
            className="w-full rounded-[12px] border px-3 py-2 text-sm outline-none"
            style={fieldStyle}
          />
        </Field>
      </div>

      <Field label="인수인계 품목 (실제 재고 이동 대상)">
        <div className="flex gap-2">
          <select
            value={selectedItemId}
            onChange={(e) => setSelectedItemId(e.target.value)}
            className="min-w-0 flex-1 rounded-[12px] border px-3 py-2 text-sm outline-none"
            style={fieldStyle}
          >
            <option value="">품목 선택...</option>
            {available.map((it) => (
              <option key={it.item_id} value={it.item_id}>
                {it.item_name}
                {it.mes_code ? ` (${it.mes_code})` : ""}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            size="md"
            onClick={addSelected}
            disabled={!selectedItemId}
            className="shrink-0 rounded-[12px] px-4 py-2 font-bold"
          >
            <Plus className="mr-1 inline h-3.5 w-3.5" />
            추가
          </Button>
        </div>
        {lines.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            {lines.map((l) => (
              <div
                key={l.item_id}
                className="flex items-center gap-2 rounded-[12px] border px-3 py-2"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
              >
                <span className="flex-1 text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
                  {l.item_name}
                  {l.mes_code && (
                    <span className="ml-2 text-xs font-normal" style={{ color: LEGACY_COLORS.muted }}>
                      {l.mes_code}
                    </span>
                  )}
                </span>
                <input
                  type="number"
                  min={1}
                  value={l.quantity}
                  onChange={(e) => setQty(l.item_id, Number(e.target.value))}
                  className="w-20 rounded-[10px] border px-2 py-1 text-center text-sm outline-none"
                  style={fieldStyle}
                  aria-label={`${l.item_name} 수량`}
                />
                <button onClick={() => removeLine(l.item_id)} aria-label="삭제">
                  <X className="h-4 w-4" style={{ color: LEGACY_COLORS.red }} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Field>

      <Field label="분석 내용 (시리얼/품목 목록 — 문서용)">
        <textarea
          value={analysisText}
          onChange={(e) => setAnalysisText(e.target.value)}
          rows={3}
          placeholder="예: 26D021, 26D022, 26D023 ..."
          className="w-full rounded-[12px] border px-3 py-2 text-sm outline-none"
          style={fieldStyle}
        />
      </Field>

      <Field label="비고">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-[12px] border px-3 py-2 text-sm outline-none"
          style={fieldStyle}
        />
      </Field>

      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          size="lg"
          onClick={saveDraft}
          disabled={!canSaveDraft}
          className="rounded-[14px] px-5 py-3 font-bold"
        >
          {busy ? "저장 중..." : "임시저장"}
        </Button>
        <Button
          variant="primary"
          size="lg"
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-[14px] px-6 py-3 font-black"
          style={{ background: LEGACY_COLORS.blue }}
        >
          {busy ? "제출 중..." : "작성 · 제출"}
        </Button>
      </div>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted }}>
        {label}
      </span>
      {children}
    </label>
  );
}
