"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type TransactionLog, type TransactionType } from "@/lib/api";
import { FilterPills } from "./FilterPills";

const TYPE_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "입고", value: "RECEIVE" },
  { label: "출고", value: "SHIP" },
  { label: "조정", value: "ADJUST" },
  { label: "생산입고", value: "PRODUCE" },
  { label: "자동차감", value: "BACKFLUSH" },
];

const PERIOD_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "오늘", value: "TODAY" },
  { label: "이번주", value: "WEEK" },
  { label: "이번달", value: "MONTH" },
];

const TX_LABELS: Record<string, string> = {
  RECEIVE: "입고",
  PRODUCE: "생산 입고",
  SHIP: "출고",
  ADJUST: "조정",
  BACKFLUSH: "자동 차감",
};

const TX_COLORS: Record<string, string> = {
  RECEIVE: "text-emerald-400",
  PRODUCE: "text-teal-400",
  SHIP: "text-red-400",
  ADJUST: "text-amber-400",
  BACKFLUSH: "text-orange-400",
};

const PAGE_SIZE = 100;

function periodStart(period: string): Date | null {
  const now = new Date();
  if (period === "TODAY") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (period === "WEEK") {
    const d = new Date(now);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === "MONTH") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return null;
}

export function HistoryTab() {
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [period, setPeriod] = useState("ALL");
  const [search, setSearch] = useState("");

  const loadLogs = async (reset = false) => {
    try {
      setLoading(true);
      const skip = reset ? 0 : (page - 1) * PAGE_SIZE;
      const params: Parameters<typeof api.getTransactions>[0] = {
        limit: PAGE_SIZE,
        skip,
      };
      if (typeFilter !== "ALL") params.transactionType = typeFilter as TransactionType;
      if (search.trim()) params.search = search.trim();

      const data = await api.getTransactions(params);
      if (reset || skip === 0) {
        setLogs(data);
      } else {
        setLogs((prev) => [...prev, ...data]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    loadLogs(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, search]);

  const filteredLogs = useMemo(() => {
    const start = periodStart(period);
    if (!start) return logs;
    return logs.filter((l) => new Date(l.created_at) >= start);
  }, [logs, period]);

  const canLoadMore = logs.length >= page * PAGE_SIZE;

  return (
    <div className="flex flex-col">
      {/* Filters */}
      <div className="space-y-2 bg-slate-900/60 px-4 pb-3 pt-3">
        <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2">
          <span className="text-slate-500">🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="품목명, 코드, 참조번호 검색"
            className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
        </div>
        <FilterPills options={TYPE_OPTIONS} value={typeFilter} onChange={setTypeFilter} />
        <FilterPills
          options={PERIOD_OPTIONS}
          value={period}
          onChange={setPeriod}
          colorActive="bg-purple-600 border-purple-500 text-white"
        />
      </div>

      <div className="border-b border-slate-800 px-4 py-2 text-xs text-slate-500">
        표시 <strong className="text-slate-200">{filteredLogs.length}</strong>건
      </div>

      {loading && logs.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500">로딩 중...</p>
      ) : filteredLogs.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500">거래 이력이 없습니다.</p>
      ) : (
        <>
          <div className="divide-y divide-slate-800/60">
            {filteredLogs.map((tx) => (
              <div key={tx.log_id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-100">{tx.item_name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      {tx.item_code}
                      {tx.reference_no ? ` · ref: ${tx.reference_no}` : ""}
                      {tx.produced_by ? ` · ${tx.produced_by}` : ""}
                    </p>
                    {tx.notes && (
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">{tx.notes}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-xs font-semibold ${TX_COLORS[tx.transaction_type] ?? "text-slate-400"}`}>
                      {TX_LABELS[tx.transaction_type] ?? tx.transaction_type}
                    </p>
                    <p
                      className={`font-mono text-base font-bold ${
                        tx.quantity_change >= 0 ? "text-emerald-300" : "text-red-300"
                      }`}
                    >
                      {tx.quantity_change >= 0 ? "+" : ""}
                      {Number(tx.quantity_change).toLocaleString()}
                    </p>
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-slate-600">
                  {new Date(tx.created_at).toLocaleString("ko-KR")}
                </p>
              </div>
            ))}
          </div>

          {canLoadMore && (
            <button
              onClick={() => {
                const nextPage = page + 1;
                setPage(nextPage);
                const skip = nextPage * PAGE_SIZE - PAGE_SIZE;
                const params: Parameters<typeof api.getTransactions>[0] = { limit: PAGE_SIZE, skip };
                if (typeFilter !== "ALL") params.transactionType = typeFilter as TransactionType;
                if (search.trim()) params.search = search.trim();
                api.getTransactions(params).then((data) => {
                  setLogs((prev) => [...prev, ...data]);
                });
              }}
              className="mx-4 my-3 rounded-xl border border-slate-700 py-2.5 text-sm text-slate-400 transition hover:bg-slate-800/50"
            >
              100건 더 보기
            </button>
          )}
        </>
      )}
    </div>
  );
}
