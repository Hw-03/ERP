"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { Button } from "@/lib/ui/Button";
import { Toast, type ToastState } from "@/lib/ui/Toast";
import { api, type Item } from "@/lib/api";

const RECEIVE_DEPARTMENTS = ["고압", "진공"];

interface DraftLine {
  item_id: string;
  item_name: string;
  mes_code: string | null;
  quantity: number;
}

export function HandoverComposeForm({
  authorEmployeeId,
  items,
  onCreated,
}: {
  authorEmployeeId: string;
  items: Item[];
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("튜브 인수인계서");
  const [toDepartment, setToDepartment] = useState(RECEIVE_DEPARTMENTS[0]);
  const [productName, setProductName] = useState("");
  const [processContent, setProcessContent] = useState("튜브 인수인계");
  const [analysisText, setAnalysisText] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return items
      .filter(
        (it) =>
          it.item_name.toLowerCase().includes(q) ||
          (it.mes_code ?? "").toLowerCase().includes(q),
      )
      .filter((it) => !lines.some((l) => l.item_id === it.item_id))
      .slice(0, 8);
  }, [search, items, lines]);

  function addLine(it: Item) {
    setLines((prev) => [
      ...prev,
      { item_id: it.item_id, item_name: it.item_name, mes_code: it.mes_code, quantity: 1 },
    ]);
    setSearch("");
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

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
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
      setToast({ message: "인수인계서를 제출했습니다.", type: "success" });
      setLines([]);
      setAnalysisText("");
      setNotes("");
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
        <div className="relative">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="품목명 또는 코드 검색"
            className="w-full rounded-[12px] border px-3 py-2 text-sm outline-none"
            style={fieldStyle}
          />
          {matches.length > 0 && (
            <div
              className="absolute z-20 mt-1 w-full overflow-hidden rounded-[12px] border shadow-lg"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
            >
              {matches.map((it) => (
                <button
                  key={it.item_id}
                  onClick={() => addLine(it)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-opacity hover:opacity-80"
                  style={{ color: LEGACY_COLORS.text }}
                >
                  <Plus className="h-3.5 w-3.5" style={{ color: LEGACY_COLORS.blue }} />
                  <span className="font-bold">{it.item_name}</span>
                  {it.mes_code && (
                    <span className="text-xs" style={{ color: LEGACY_COLORS.muted }}>
                      {it.mes_code}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
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

      <div className="flex justify-end">
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
