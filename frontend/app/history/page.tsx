"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CalendarRange, Pencil, ScrollText, Search } from "lucide-react";

import AppHeader from "@/components/AppHeader";
import { api, type TransactionLog, type TransactionType } from "@/lib/api";

const TYPE_OPTIONS: { label: string; value: TransactionType | "ALL" }[] = [
  { label: "전체",     value: "ALL" },
  { label: "입고",     value: "RECEIVE" },
  { label: "출고",     value: "SHIP" },
  { label: "생산입고", value: "PRODUCE" },
  { label: "조정",     value: "ADJUST" },
  { label: "자동차감", value: "BACKFLUSH" },
];

const PERIOD_OPTIONS = [
  { label: "전체",      value: "ALL" },
  { label: "오늘",      value: "TODAY" },
  { label: "이번 주",   value: "WEEK" },
  { label: "최근 30일", value: "MONTH" },
] as const;
type PeriodFilter = (typeof PERIOD_OPTIONS)[number]["value"];

const TX_TYPE_LABEL: Record<string, string> = {
  RECEIVE: "입고", PRODUCE: "생산입고", SHIP: "출고", ADJUST: "조정", BACKFLUSH: "자동차감",
};
const TX_TYPE_BADGE: Record<string, string> = {
  RECEIVE:   "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  PRODUCE:   "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  SHIP:      "border-red-500/30 bg-red-500/10 text-red-200",
  ADJUST:    "border-amber-500/30 bg-amber-500/10 text-amber-200",
  BACKFLUSH: "border-orange-500/30 bg-orange-500/10 text-orange-200",
};

type ToastState = { message: string; type: "success" | "error" } | null;

export default function HistoryPage() {
  const [transactions, setTransactions] = useState<TransactionLog[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  const [selectedType,   setSelectedType]   = useState<TransactionType | "ALL">("ALL");
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>("ALL");
  const [search,         setSearch]         = useState("");
  const [selected,       setSelected]       = useState<TransactionLog | null>(null);
  const [focusedIndex,   setFocusedIndex]   = useState(0);

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesInput,   setNotesInput]   = useState("");
  const [savingNotes,  setSavingNotes]  = useState(false);
  const [toast,        setToast]        = useState<ToastState>(null);

  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRefs  = useRef<(HTMLButtonElement | null)[]>([]);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    api.getTransactions({ limit: 2000 })
      .then((data) => { setTransactions(data); setError(null); })
      .catch((err) => setError(err instanceof Error ? err.message : "거래 이력을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
    return () => { if (toastRef.current) clearTimeout(toastRef.current); };
  }, []);

  useEffect(() => { setEditingNotes(false); setNotesInput(""); }, [selected?.log_id]);

  const filteredTransactions = useMemo(() => {
    const keyword = deferredSearch.trim().toLowerCase();
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now);
    monthStart.setDate(now.getDate() - 30);

    return transactions.filter((tx) => {
      if (selectedType !== "ALL" && tx.transaction_type !== selectedType) return false;
      const created = new Date(tx.created_at);
      if (selectedPeriod === "TODAY" && created.toDateString() !== now.toDateString()) return false;
      if (selectedPeriod === "WEEK"  && created < weekStart)  return false;
      if (selectedPeriod === "MONTH" && created < monthStart) return false;
      if (!keyword) return true;
      return [tx.item_name, tx.item_code, tx.reference_no ?? "", tx.notes ?? "", tx.produced_by ?? ""]
        .join(" ").toLowerCase().includes(keyword);
    });
  }, [deferredSearch, selectedPeriod, selectedType, transactions]);

  useEffect(() => {
    if (!selected) return;
    const idx = filteredTransactions.findIndex((t) => t.log_id === selected.log_id);
    if (idx >= 0) setFocusedIndex(idx);
  }, [filteredTransactions, selected]);

  const showToast = (message: string, type: "success" | "error") => {
    if (toastRef.current) clearTimeout(toastRef.current);
    setToast({ message, type });
    toastRef.current = setTimeout(() => setToast(null), 3000);
  };

  const handleKeyNav = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const next = Math.min(Math.max(focusedIndex + (e.key === "ArrowDown" ? 1 : -1), 0), filteredTransactions.length - 1);
    setFocusedIndex(next);
    setSelected(filteredTransactions[next]);
    rowRefs.current[next]?.scrollIntoView({ block: "nearest" });
  };

  const handleSaveNotes = async () => {
    if (!selected) return;
    try {
      setSavingNotes(true);
      await api.updateTransactionNotes(selected.log_id, notesInput);
      setTransactions((prev) =>
        prev.map((t) => t.log_id === selected.log_id ? { ...t, notes: notesInput } : t),
      );
      setSelected((prev) => prev ? { ...prev, notes: notesInput } : prev);
      setEditingNotes(false);
      showToast("비고가 업데이트되었습니다.", "success");
    } catch {
      showToast("비고 저장에 실패했습니다.", "error");
    } finally {
      setSavingNotes(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AppHeader />

      <main className="mx-auto max-w-screen-2xl px-6 pb-8">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 py-4">
          <label className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="품목명, 코드, 참조번호, 비고 검색"
              className="w-full rounded-2xl border border-slate-800 bg-slate-900/80 py-3 pl-10 pr-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-blue-500"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-2.5">
            {TYPE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setSelectedType(o.value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  selectedType === o.value
                    ? "border-blue-500 bg-blue-500 text-white"
                    : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-2.5">
            <CalendarRange className="h-4 w-4 shrink-0 text-slate-500" />
            {PERIOD_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setSelectedPeriod(o.value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  selectedPeriod === o.value
                    ? "border-emerald-500 bg-emerald-500 text-slate-950"
                    : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <span className="ml-auto shrink-0 text-sm text-slate-400">
            {filteredTransactions.length.toLocaleString()}건
          </span>
        </div>

        {/* Master-Detail layout */}
        <div className="grid h-[calc(100vh-148px)] grid-cols-[minmax(520px,1.6fr)_minmax(360px,1fr)] gap-4">

          {/* LEFT: table */}
          <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/70">
            <div className="border-b border-slate-800 bg-slate-900/60 px-5 py-3">
              <div className="grid grid-cols-[108px_1fr_86px_86px_116px] text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <span>유형</span>
                <span>품목</span>
                <span className="text-right">변동</span>
                <span className="text-right">처리후</span>
                <span className="text-right">시각</span>
              </div>
            </div>

            <div
              tabIndex={0}
              onKeyDown={handleKeyNav}
              className="min-h-0 flex-1 overflow-y-auto outline-none"
            >
              {loading ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  거래 이력을 불러오는 중입니다.
                </div>
              ) : error ? (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-red-300">{error}</div>
              ) : filteredTransactions.length === 0 ? (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
                  조건에 맞는 거래 이력이 없습니다.
                </div>
              ) : (
                filteredTransactions.map((tx, idx) => {
                  const isSelected = selected?.log_id === tx.log_id;
                  return (
                    <button
                      key={tx.log_id}
                      ref={(node) => { rowRefs.current[idx] = node; }}
                      type="button"
                      onClick={() => { setFocusedIndex(idx); setSelected(tx); }}
                      className={`grid w-full grid-cols-[108px_1fr_86px_86px_116px] items-center border-b border-slate-900 px-5 py-3 text-left transition ${
                        isSelected
                          ? "border-l-2 border-l-blue-500 bg-blue-900/25"
                          : "border-l-2 border-l-transparent hover:bg-slate-900/60"
                      }`}
                    >
                      <span>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TX_TYPE_BADGE[tx.transaction_type] ?? "border-slate-700 bg-slate-900 text-slate-300"}`}>
                          {TX_TYPE_LABEL[tx.transaction_type] ?? tx.transaction_type}
                        </span>
                      </span>
                      <span className="pr-4">
                        <span className="block text-sm font-medium leading-tight text-slate-100">{tx.item_name}</span>
                        <span className="block font-mono text-xs text-slate-500">{tx.item_code}</span>
                      </span>
                      <span className={`text-right font-mono text-sm ${tx.quantity_change >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                        {tx.quantity_change >= 0 ? "+" : ""}{Number(tx.quantity_change).toLocaleString()}
                      </span>
                      <span className="text-right font-mono text-sm text-slate-400">
                        {tx.quantity_after == null ? "—" : Number(tx.quantity_after).toLocaleString()}
                      </span>
                      <span className="text-right text-xs text-slate-500">
                        {new Date(tx.created_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {/* RIGHT: Detail panel */}
          <aside className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/70">
            <div className="border-b border-slate-800 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Transaction Detail</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-50">거래 상세</h2>
            </div>

            {!selected ? (
              <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-800/60 text-slate-600">
                  <ScrollText className="h-9 w-9" />
                </div>
                <h3 className="mt-5 text-base font-semibold text-slate-300">거래를 선택해 주세요</h3>
                <p className="mt-2 max-w-xs text-sm leading-6 text-slate-500">
                  좌측 테이블에서 거래를 클릭하면 상세 정보가 표시됩니다. ↑↓ 키로 탐색할 수 있습니다.
                </p>
              </div>
            ) : (
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
                {/* Header */}
                <div>
                  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${TX_TYPE_BADGE[selected.transaction_type] ?? "border-slate-700 bg-slate-900 text-slate-300"}`}>
                    {TX_TYPE_LABEL[selected.transaction_type] ?? selected.transaction_type}
                  </span>
                  <h3 className="mt-3 text-2xl font-bold text-slate-50">{selected.item_name}</h3>
                  <p className="mt-1 font-mono text-sm text-blue-300">{selected.item_code}</p>
                  {selected.item_category && (
                    <p className="mt-1 text-sm text-slate-400">{selected.item_category}</p>
                  )}
                </div>

                {/* Quantity grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">변동 수량</p>
                    <p className={`mt-2 font-mono text-2xl font-semibold ${selected.quantity_change >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                      {selected.quantity_change >= 0 ? "+" : ""}{Number(selected.quantity_change).toLocaleString()}
                      <span className="ml-1 text-sm text-slate-500">{selected.item_unit}</span>
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">처리 후 재고</p>
                    <p className="mt-2 font-mono text-2xl font-semibold text-slate-50">
                      {selected.quantity_after == null ? "—" : Number(selected.quantity_after).toLocaleString()}
                      <span className="ml-1 text-sm text-slate-500">{selected.item_unit}</span>
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">처리 전 재고</p>
                    <p className="mt-2 font-mono text-xl font-semibold text-slate-300">
                      {selected.quantity_before == null ? "—" : Number(selected.quantity_before).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">처리 시각</p>
                    <p className="mt-2 text-sm font-medium text-slate-200">
                      {new Date(selected.created_at).toLocaleString("ko-KR")}
                    </p>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">담당자</span>
                    <span className="text-slate-200">{selected.produced_by || "—"}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">참조 번호</span>
                    <span className="font-mono text-slate-200">{selected.reference_no || "—"}</span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-slate-500">비고</span>
                      {!editingNotes && (
                        <div className="flex items-center gap-2">
                          <span className="text-right text-slate-200">{selected.notes || "—"}</span>
                          <button
                            type="button"
                            onClick={() => { setNotesInput(selected.notes ?? ""); setEditingNotes(true); }}
                            className="text-slate-600 hover:text-slate-300"
                            title="비고 편집"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    {editingNotes && (
                      <div className="mt-2 space-y-2">
                        <input
                          autoFocus
                          value={notesInput}
                          onChange={(e) => setNotesInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleSaveNotes();
                            if (e.key === "Escape") setEditingNotes(false);
                          }}
                          className="w-full rounded-xl border border-blue-500 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none"
                          placeholder="비고 입력..."
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void handleSaveNotes()}
                            disabled={savingNotes}
                            className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-400 disabled:opacity-50"
                          >
                            {savingNotes ? "저장 중..." : "저장"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingNotes(false)}
                            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div className={`rounded-2xl border px-5 py-4 shadow-2xl ${
            toast.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-50"
              : "border-red-500/30 bg-red-500/15 text-red-50"
          }`}>
            <p className="text-sm font-semibold">{toast.message}</p>
          </div>
        </div>
      )}
    </div>
  );
}
