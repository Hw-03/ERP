"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, Search, X } from "lucide-react";

import AppHeader from "@/components/AppHeader";
import { api, type TransactionLog, type TransactionType } from "@/lib/api";

const TYPE_OPTIONS: { label: string; value: TransactionType | "ALL" }[] = [
  { label: "전체", value: "ALL" },
  { label: "입고", value: "RECEIVE" },
  { label: "출고", value: "SHIP" },
  { label: "생산 입고", value: "PRODUCE" },
  { label: "조정", value: "ADJUST" },
  { label: "자동 차감", value: "BACKFLUSH" },
];

const PERIOD_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "오늘", value: "TODAY" },
  { label: "이번 주", value: "WEEK" },
  { label: "최근 30일", value: "MONTH" },
] as const;

type PeriodFilter = (typeof PERIOD_OPTIONS)[number]["value"];

const TX_TYPE_LABEL = {
  RECEIVE: "입고",
  PRODUCE: "생산 입고",
  SHIP: "출고",
  ADJUST: "조정",
  BACKFLUSH: "자동 차감",
};

function TransactionDetailModal({
  transaction,
  onClose,
}: {
  transaction: TransactionLog | null;
  onClose: () => void;
}) {
  if (!transaction) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-[28px] border border-slate-800 bg-slate-950 shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-800 px-6 py-5">
          <div>
            <p className="text-sm text-slate-400">{TX_TYPE_LABEL[transaction.transaction_type]}</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-100">
              {transaction.item_name}
            </h2>
            <p className="mt-2 font-mono text-xs text-slate-500">{transaction.item_code}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              기본 정보
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">카테고리</dt>
                <dd className="text-right text-slate-200">{transaction.item_category}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">변동 수량</dt>
                <dd
                  className={`font-mono ${
                    transaction.quantity_change >= 0 ? "text-emerald-300" : "text-red-300"
                  }`}
                >
                  {transaction.quantity_change >= 0 ? "+" : ""}
                  {Number(transaction.quantity_change).toLocaleString()} {transaction.item_unit}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">처리 시각</dt>
                <dd className="text-right text-slate-200">
                  {new Date(transaction.created_at).toLocaleString("ko-KR")}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">처리자</dt>
                <dd className="text-right text-slate-200">{transaction.produced_by || "-"}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              수량 추적
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">이전 재고</dt>
                <dd className="font-mono text-slate-200">
                  {transaction.quantity_before == null
                    ? "-"
                    : Number(transaction.quantity_before).toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">이후 재고</dt>
                <dd className="font-mono text-slate-200">
                  {transaction.quantity_after == null
                    ? "-"
                    : Number(transaction.quantity_after).toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">참조 번호</dt>
                <dd className="text-right text-slate-200">{transaction.reference_no || "-"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">비고</dt>
                <dd className="text-right text-slate-200">{transaction.notes || "-"}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const [transactions, setTransactions] = useState<TransactionLog[]>([]);
  const [selectedType, setSelectedType] = useState<TransactionType | "ALL">("ALL");
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>("ALL");
  const [search, setSearch] = useState("");
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .getTransactions({ limit: 2000 })
      .then((data) => {
        if (!cancelled) {
          setTransactions(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "거래 이력을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredTransactions = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now);
    monthStart.setDate(now.getDate() - 30);

    return transactions.filter((tx) => {
      if (selectedType !== "ALL" && tx.transaction_type !== selectedType) {
        return false;
      }

      const created = new Date(tx.created_at);
      if (selectedPeriod === "TODAY" && created.toDateString() !== now.toDateString()) {
        return false;
      }
      if (selectedPeriod === "WEEK" && created < weekStart) {
        return false;
      }
      if (selectedPeriod === "MONTH" && created < monthStart) {
        return false;
      }

      if (!keyword) return true;
      return [
        tx.item_name,
        tx.item_code,
        tx.reference_no ?? "",
        tx.notes ?? "",
        tx.produced_by ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [search, selectedPeriod, selectedType, transactions]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AppHeader />

      <main className="mx-auto max-w-screen-2xl px-6 py-8">
        <section className="rounded-[28px] border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Transaction Timeline
          </p>
          <h2 className="mt-3 text-4xl font-black tracking-tight">전체 거래 이력</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            입고, 출고, 조정, 생산 입고, Backflush 이력을 모두 조회합니다. 레거시 재고관리앱의
            히스토리 뷰를 현재 ERP 데이터 모델에 맞게 재구성했습니다.
          </p>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr,0.85fr,0.85fr]">
            <label className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="품목명, 코드, 참조번호, 비고 검색"
                className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
              />
            </label>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3">
              <div className="flex flex-wrap gap-2">
                {TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setSelectedType(option.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${
                      selectedType === option.value
                        ? "border-blue-500 bg-blue-500 text-white"
                        : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <CalendarRange className="h-4 w-4 text-slate-500" />
                {PERIOD_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setSelectedPeriod(option.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${
                      selectedPeriod === option.value
                        ? "border-emerald-500 bg-emerald-500 text-slate-950"
                        : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-[24px] border border-slate-800 bg-slate-900/60 shadow-xl">
          <div className="border-b border-slate-800 px-5 py-4">
            <p className="text-sm text-slate-400">
              총 {filteredTransactions.length.toLocaleString()}건 표시 중
            </p>
          </div>

          {error ? (
            <div className="px-5 py-6 text-sm text-red-300">{error}</div>
          ) : loading ? (
            <div className="px-5 py-10 text-center text-sm text-slate-400">
              거래 이력을 불러오는 중입니다.
            </div>
          ) : (
            <div className="max-h-[72vh] overflow-auto">
              <table className="w-full min-w-[1080px] text-sm">
                <thead className="sticky top-0 z-10 bg-slate-950/95">
                  <tr className="border-b border-slate-800">
                    <th className="px-5 py-3 text-left text-slate-500">유형</th>
                    <th className="px-5 py-3 text-left text-slate-500">품목</th>
                    <th className="px-5 py-3 text-left text-slate-500">참조 번호</th>
                    <th className="px-5 py-3 text-right text-slate-500">변동 수량</th>
                    <th className="px-5 py-3 text-right text-slate-500">현재 수량</th>
                    <th className="px-5 py-3 text-right text-slate-500">시각</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((tx, index) => (
                    <tr
                      key={tx.log_id}
                      onClick={() => setSelectedTransaction(tx)}
                      className={`cursor-pointer border-b border-slate-800/80 transition hover:bg-slate-800/70 ${
                        index % 2 === 0 ? "bg-slate-900/20" : ""
                      }`}
                    >
                      <td className="px-5 py-4">
                        <span className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-xs text-slate-300">
                          {TX_TYPE_LABEL[tx.transaction_type]}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-100">{tx.item_name}</p>
                        <p className="mt-1 font-mono text-xs text-slate-500">{tx.item_code}</p>
                      </td>
                      <td className="px-5 py-4 text-slate-400">{tx.reference_no || "-"}</td>
                      <td
                        className={`px-5 py-4 text-right font-mono ${
                          tx.quantity_change >= 0 ? "text-emerald-300" : "text-red-300"
                        }`}
                      >
                        {tx.quantity_change >= 0 ? "+" : ""}
                        {Number(tx.quantity_change).toLocaleString()}
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-slate-400">
                        {tx.quantity_after == null
                          ? "-"
                          : Number(tx.quantity_after).toLocaleString()}
                      </td>
                      <td className="px-5 py-4 text-right text-xs text-slate-500">
                        {new Date(tx.created_at).toLocaleString("ko-KR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredTransactions.length === 0 && (
                <div className="px-5 py-10 text-center text-sm text-slate-500">
                  조건에 맞는 거래 이력이 없습니다.
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      <TransactionDetailModal
        transaction={selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
      />
    </div>
  );
}
