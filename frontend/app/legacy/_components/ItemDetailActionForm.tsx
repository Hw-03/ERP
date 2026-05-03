"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";

export type ItemDetailActionMode = "ADJUST" | "RECEIVE" | "SHIP";

/**
 * Round-13 (#14) 추출 — ItemDetailSheet 의 mode 선택 + 수량 입력 + 비고 + 제출 폼.
 */
export interface ItemDetailActionFormProps {
  mode: ItemDetailActionMode;
  qty: string;
  notes: string;
  error: string | null;
  saving: boolean;
  initialQuantity: number;
  setMode: (m: ItemDetailActionMode) => void;
  setQty: (v: string) => void;
  setNotes: (v: string) => void;
  bump: (delta: number) => void;
  onSubmit: () => void;
}

export function ItemDetailActionForm({
  mode,
  qty,
  notes,
  error,
  saving,
  initialQuantity,
  setMode,
  setQty,
  setNotes,
  bump,
  onSubmit,
}: ItemDetailActionFormProps) {
  return (
    <div className="mb-[14px] overflow-hidden rounded-[14px] border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
      <div className="flex gap-2 px-[14px] py-3">
        {[
          { id: "ADJUST", label: "조정" },
          { id: "RECEIVE", label: "입고" },
          { id: "SHIP", label: "출고" },
        ].map((action) => (
          <button
            key={action.id}
            onClick={() => {
              setMode(action.id as ItemDetailActionMode);
              setQty(action.id === "ADJUST" ? String(initialQuantity) : "1");
            }}
            className="flex-1 rounded-xl py-2 text-xs font-bold"
            style={{
              background: mode === action.id ? LEGACY_COLORS.blue : LEGACY_COLORS.s3,
              color: mode === action.id ? "#fff" : LEGACY_COLORS.muted2,
            }}
          >
            {action.label}
          </button>
        ))}
      </div>

      <div className="px-[14px] pb-[14px]">
        <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>
          {mode === "ADJUST" ? "최종 수량" : "처리 수량"}
        </div>
        <input
          value={qty}
          onChange={(event) => setQty(event.target.value)}
          inputMode="numeric"
          className="mb-[7px] w-full rounded-[11px] border px-[13px] py-[11px] text-center text-[22px] font-bold outline-none"
          style={{
            background: LEGACY_COLORS.s1,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
          }}
        />
        <div className="mb-3 grid grid-cols-4 gap-[7px]">
          {[-10, -1, 1, 10].map((delta) => (
            <button
              key={delta}
              onClick={() => bump(delta)}
              className="rounded-[10px] py-[11px] text-sm font-bold"
              style={{
                background: delta < 0 ? "rgba(242,95,92,.15)" : "rgba(31,209,122,.12)",
                color: delta < 0 ? LEGACY_COLORS.red : LEGACY_COLORS.green,
              }}
            >
              {delta > 0 ? `+${delta}` : delta}
            </button>
          ))}
        </div>

        <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>
          비고
        </div>
        <input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="메모 (선택)"
          className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none"
          style={{
            background: LEGACY_COLORS.s1,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
          }}
        />

        {error ? (
          <div
            className="mt-3 rounded-xl border px-3 py-2 text-xs"
            style={{
              background: "rgba(242,95,92,.12)",
              borderColor: "rgba(242,95,92,.25)",
              color: LEGACY_COLORS.red,
            }}
          >
            {error}
          </div>
        ) : null}

        <button
          onClick={onSubmit}
          disabled={saving}
          className="mt-3 w-full rounded-xl py-[13px] text-[15px] font-bold disabled:opacity-50"
          style={{ background: LEGACY_COLORS.blue, color: "#fff" }}
        >
          {saving ? "처리 중..." : mode === "ADJUST" ? "수정" : mode === "RECEIVE" ? "입고" : "출고"}
        </button>
      </div>
    </div>
  );
}
