"use client";

import { useEffect, useState } from "react";
import { api, type Item, type TransactionLog } from "@/lib/api";
import { BottomSheet } from "./BottomSheet";

type ActionMode = "ADJUST" | "RECEIVE" | "SHIP";

const TX_LABELS: Record<string, string> = {
  RECEIVE: "입고",
  PRODUCE: "생산 입고",
  SHIP: "출고",
  ADJUST: "조정",
  BACKFLUSH: "자동 차감",
};

function fmt(v: number | string | null | undefined) {
  if (v == null) return "-";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function ItemDetailSheet({
  item,
  onClose,
  onSaved,
}: {
  item: Item | null;
  onClose: () => void;
  onSaved: (updated: Item) => void;
}) {
  const [mode, setMode] = useState<ActionMode>("ADJUST");
  const [qty, setQty] = useState("0");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    if (!item) return;
    setMode("ADJUST");
    setQty(String(Number(item.quantity)));
    setNotes("");
    setError(null);
    setLogsLoading(true);
    api
      .getTransactions({ itemId: item.item_id, limit: 10 })
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLogsLoading(false));
  }, [item]);

  if (!item) return null;

  const bump = (delta: number) => {
    const min = mode === "ADJUST" ? 0 : 1;
    setQty((prev) => String(Math.max(min, Number(prev || 0) + delta)));
  };

  const handleModeChange = (m: ActionMode) => {
    setMode(m);
    setError(null);
    setQty(m === "ADJUST" ? String(Number(item.quantity)) : "1");
  };

  const handleSave = async () => {
    const n = Number(qty);
    if (isNaN(n) || n < 0) { setError("수량을 확인해 주세요."); return; }
    if (mode !== "ADJUST" && n <= 0) { setError("수량은 1 이상이어야 합니다."); return; }
    if (!notes.trim()) { setError("메모/사유를 입력해 주세요."); return; }

    try {
      setSaving(true);
      setError(null);
      let resp;
      if (mode === "ADJUST") {
        resp = await api.adjustInventory({ item_id: item.item_id, quantity: n, reason: notes });
      } else if (mode === "RECEIVE") {
        resp = await api.receiveInventory({ item_id: item.item_id, quantity: n, notes });
      } else {
        resp = await api.shipInventory({ item_id: item.item_id, quantity: n, notes });
      }
      onSaved({ ...item, quantity: Number(resp.quantity), location: resp.location, updated_at: resp.updated_at });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open={!!item} onClose={onClose} title={item.item_name}>
      <div className="space-y-4 px-5 pb-6 pt-3">
        {/* Item info */}
        <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-4">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-400">코드</dt>
              <dd className="font-mono text-blue-300">{item.item_code}</dd>
            </div>
            {item.spec && (
              <div className="flex justify-between">
                <dt className="text-slate-400">사양</dt>
                <dd className="text-right text-slate-200">{item.spec}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-slate-400">현재고</dt>
              <dd className="font-mono text-2xl font-bold text-cyan-300">{fmt(item.quantity)}</dd>
            </div>
            {item.location && (
              <div className="flex justify-between">
                <dt className="text-slate-400">위치</dt>
                <dd className="text-slate-200">{item.location}</dd>
              </div>
            )}
            {item.legacy_model && (
              <div className="flex justify-between">
                <dt className="text-slate-400">모델</dt>
                <dd className="text-slate-200">{item.legacy_model}</dd>
              </div>
            )}
            {item.barcode && (
              <div className="flex justify-between">
                <dt className="text-slate-400">바코드</dt>
                <dd className="font-mono text-slate-300">{item.barcode}</dd>
              </div>
            )}
            {item.min_stock != null && (
              <div className="flex justify-between">
                <dt className="text-slate-400">안전재고</dt>
                <dd className="text-slate-200">{fmt(item.min_stock)}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Action mode */}
        <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-4">
          <div className="mb-3 flex gap-2">
            {(["ADJUST", "RECEIVE", "SHIP"] as ActionMode[]).map((m) => (
              <button
                key={m}
                onClick={() => handleModeChange(m)}
                className={`flex-1 rounded-xl py-2 text-xs font-semibold transition ${
                  mode === m
                    ? "bg-blue-600 text-white"
                    : "bg-slate-900 text-slate-400 hover:text-slate-200"
                }`}
              >
                {m === "ADJUST" ? "조정" : m === "RECEIVE" ? "입고" : "출고"}
              </button>
            ))}
          </div>

          <p className="mb-2 text-xs text-slate-500">
            {mode === "ADJUST" ? "조정 후 최종 수량" : "처리 수량"}
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={() => bump(-1)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-300 hover:bg-red-500/20"
            >
              −
            </button>
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-center font-mono text-xl text-slate-100 outline-none"
              inputMode="numeric"
            />
            <button
              onClick={() => bump(1)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
            >
              +
            </button>
          </div>

          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {[1, 5, 10, 50].map((v) => (
              <button
                key={v}
                onClick={() => bump(v)}
                className="rounded-lg border border-slate-700 bg-slate-900/60 py-1.5 text-xs text-slate-300 hover:border-slate-600"
              >
                +{v}
              </button>
            ))}
          </div>

          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={mode === "ADJUST" ? "조정 사유 (필수)" : "메모 (필수)"}
            className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />

          {error && (
            <p className="mt-2 rounded-xl border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-3 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? "처리 중..." : mode === "ADJUST" ? "저장" : mode === "RECEIVE" ? "입고" : "출고"}
          </button>
        </div>

        {/* Recent transactions */}
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            최근 이력 (최대 10건)
          </p>
          {logsLoading ? (
            <p className="text-xs text-slate-500">로딩 중...</p>
          ) : logs.length === 0 ? (
            <p className="text-xs text-slate-500">거래 이력 없음</p>
          ) : (
            <div className="space-y-2">
              {logs.map((tx) => (
                <div
                  key={tx.log_id}
                  className="rounded-xl border border-slate-700 bg-slate-800/40 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-200">
                      {TX_LABELS[tx.transaction_type] ?? tx.transaction_type}
                    </span>
                    <span
                      className={`font-mono text-sm ${
                        tx.quantity_change >= 0 ? "text-emerald-300" : "text-red-300"
                      }`}
                    >
                      {tx.quantity_change >= 0 ? "+" : ""}
                      {Number(tx.quantity_change).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {new Date(tx.created_at).toLocaleString("ko-KR")}
                    {tx.notes ? ` · ${tx.notes}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
