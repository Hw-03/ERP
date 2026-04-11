"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  Layers,
  Package,
  RefreshCw,
  TableProperties,
  TrendingUp,
  Zap,
} from "lucide-react";

import CategoryCard from "@/components/CategoryCard";
import UKAlert from "@/components/UKAlert";
import { api, type InventorySummary, type TransactionLog } from "@/lib/api";

const FLOW_STAGES = [
  { label: "원자재", code: "RM", color: "text-slate-400" },
  { label: "튜브 공정", code: "TA / TF", color: "text-blue-400" },
  { label: "고압 공정", code: "HA / HF", color: "text-purple-400" },
  { label: "진공 공정", code: "VA / VF", color: "text-cyan-400" },
  { label: "조립 공정", code: "BA / BF", color: "text-indigo-400" },
  { label: "완제품", code: "FG", color: "text-green-400" },
];

const TX_TYPE_STYLE: Record<string, string> = {
  RECEIVE: "border-green-700/50 bg-green-900/50 text-green-300",
  PRODUCE: "border-blue-700/50 bg-blue-900/50 text-blue-300",
  SHIP: "border-orange-700/50 bg-orange-900/50 text-orange-300",
  ADJUST: "border-yellow-700/50 bg-yellow-900/50 text-yellow-300",
  BACKFLUSH: "border-purple-700/50 bg-purple-900/50 text-purple-300",
};

const TX_TYPE_LABEL: Record<string, string> = {
  RECEIVE: "입고",
  PRODUCE: "생산",
  SHIP: "출하",
  ADJUST: "조정",
  BACKFLUSH: "자동차감",
};

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-blue-400",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/80 p-4 shadow-md">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-400">{label}</span>
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg bg-slate-700 ${color}`}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className={`font-mono text-3xl font-bold ${color}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [transactions, setTransactions] = useState<TransactionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setRefreshing(true);

      const [summaryData, txData] = await Promise.all([
        api.getInventorySummary(),
        api.getTransactions({ limit: 10 }),
      ]);

      setSummary(summaryData);
      setTransactions(txData);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? `API 연결 실패: ${err.message}`
          : "데이터를 불러오지 못했습니다. 백엔드 서버 상태를 확인해 주세요.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60_000);
    return () => clearInterval(interval);
  }, [loadData]);

  const mainCategories =
    summary?.categories.filter((category) => category.category !== "UK") ?? [];
  const ukCategory = summary?.categories.find((category) => category.category === "UK");
  const totalQty = summary?.total_quantity ?? 0;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-sm text-slate-400">ERP 데이터를 불러오는 중입니다.</p>
        </div>
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
        <div className="w-full max-w-md rounded-2xl border border-red-800/50 bg-slate-800 p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-900/30">
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>
          <h2 className="mb-2 text-xl font-bold text-slate-100">연결 오류</h2>
          <p className="mb-6 text-sm text-slate-400">{error}</p>
          <div className="mb-6 rounded-lg bg-slate-900 p-4 text-left">
            <p className="text-xs font-mono text-slate-500">
              $ cd backend
              <br />$ uvicorn app.main:app --reload
            </p>
          </div>
          <button
            onClick={loadData}
            className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/95 shadow-lg backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-screen-2xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 shadow-md shadow-blue-900/50">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-none text-slate-100">X-Ray ERP</h1>
              <p className="mt-0.5 text-xs leading-none text-slate-500">
                정밀 제조 재고 대시보드
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/inventory"
              className="hidden items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-600 hover:text-white sm:inline-flex"
            >
              <TableProperties className="h-4 w-4" />
              품목 리스트
            </Link>

            {(summary?.uk_item_count ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 text-sm text-red-400">
                <AlertTriangle className="h-4 w-4 animate-pulse" />
                <span className="font-medium">미분류 {summary?.uk_item_count}건</span>
              </div>
            )}

            {lastUpdated && (
              <span className="hidden text-xs text-slate-600 sm:block">
                {lastUpdated.toLocaleTimeString("ko-KR")} 갱신
              </span>
            )}

            <button
              onClick={loadData}
              disabled={refreshing}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50"
              aria-label="데이터 새로고침"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-screen-2xl px-6 py-8">
        {(summary?.uk_item_count ?? 0) > 0 && <UKAlert count={summary!.uk_item_count} />}

        {error && summary && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-700/50 bg-amber-900/30 px-4 py-2 text-sm text-amber-400">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>{error} 마지막으로 가져온 데이터를 표시 중입니다.</span>
          </div>
        )}

        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-1">
            {FLOW_STAGES.map((stage, index) => (
              <div key={stage.code} className="flex items-center gap-1">
                <div className="rounded-lg border border-slate-700/40 bg-slate-800/60 px-3 py-1.5 text-center">
                  <p className={`font-mono text-xs font-bold ${stage.color}`}>{stage.code}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{stage.label}</p>
                </div>
                {index < FLOW_STAGES.length - 1 && (
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-600" />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard
            icon={Package}
            label="총 품목 수"
            value={summary?.total_items ?? 0}
            sub="등록된 전체 품목"
            color="text-blue-400"
          />
          <KpiCard
            icon={Layers}
            label="총 재고 수량"
            value={Math.round(Number(totalQty)).toLocaleString()}
            sub="전체 카테고리 합산"
            color="text-cyan-400"
          />
          <KpiCard
            icon={Activity}
            label="오늘 거래"
            value={
              transactions.filter((tx) => {
                const created = new Date(tx.created_at);
                const today = new Date();
                return created.toDateString() === today.toDateString();
              }).length
            }
            sub="입고, 생산, 출하, 조정"
            color="text-green-400"
          />
          <KpiCard
            icon={AlertTriangle}
            label="미분류 품목"
            value={summary?.uk_item_count ?? 0}
            sub={
              (summary?.uk_item_count ?? 0) > 0
                ? "우선 카테고리 분류 필요"
                : "모든 품목 분류 완료"
            }
            color={(summary?.uk_item_count ?? 0) > 0 ? "text-red-400" : "text-green-400"}
          />
        </div>

        <div className="mb-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">카테고리별 재고 현황</h2>
              <p className="mt-0.5 text-sm text-slate-500">제조 공정 순서 기준으로 정렬됩니다.</p>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
              <span className="text-xs text-slate-500">실시간 요약</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {mainCategories.map((category) => (
              <CategoryCard key={category.category} data={category} />
            ))}
          </div>
        </div>

        {ukCategory && (
          <div className="mb-8">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <h3 className="text-sm font-semibold text-red-400">미분류 품목 현황 (UK)</h3>
            </div>
            <div className="max-w-xs">
              <CategoryCard data={ukCategory} isAlert />
            </div>
          </div>
        )}

        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">최근 거래 이력</h2>
            <span className="text-xs text-slate-500">최근 10건</span>
          </div>

          {transactions.length === 0 ? (
            <div className="rounded-xl border border-slate-700/40 bg-slate-800/60 p-8 text-center">
              <TrendingUp className="mx-auto mb-3 h-10 w-10 text-slate-600" />
              <p className="text-sm text-slate-500">거래 이력이 아직 없습니다.</p>
              <p className="mt-1 text-xs text-slate-600">
                입고, 생산, 출하를 처리하면 여기에 표시됩니다.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-700/40 bg-slate-800/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/60 bg-slate-900/40">
                    <th className="px-4 py-3 text-left font-medium text-slate-400">유형</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-400">품목</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-400">
                      수량 변화
                    </th>
                    <th className="hidden px-4 py-3 text-left font-medium text-slate-400 md:table-cell">
                      참조번호
                    </th>
                    <th className="hidden px-4 py-3 text-right font-medium text-slate-400 lg:table-cell">
                      처리 시각
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx, index) => {
                    const isPositive = Number(tx.quantity_change) > 0;

                    return (
                      <tr
                        key={tx.log_id}
                        className={`border-b border-slate-700/30 transition-colors hover:bg-slate-700/20 ${
                          index % 2 === 0 ? "" : "bg-slate-900/20"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-xs ${
                              TX_TYPE_STYLE[tx.transaction_type] ??
                              "border-slate-600 bg-slate-700 text-slate-300"
                            }`}
                          >
                            {TX_TYPE_LABEL[tx.transaction_type] ?? tx.transaction_type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-slate-300">
                            {tx.item_id.slice(0, 8)}...
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`font-mono font-semibold ${
                              isPositive ? "text-green-400" : "text-red-400"
                            }`}
                          >
                            {isPositive ? "+" : ""}
                            {Number(tx.quantity_change).toLocaleString()}
                          </span>
                        </td>
                        <td className="hidden px-4 py-3 text-xs text-slate-500 md:table-cell">
                          {tx.reference_no ?? "-"}
                        </td>
                        <td className="hidden px-4 py-3 text-right text-xs text-slate-500 lg:table-cell">
                          {new Date(tx.created_at).toLocaleString("ko-KR", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <footer className="mt-12 border-t border-slate-800/60 pt-6 text-center">
          <p className="text-xs text-slate-600">
            X-Ray ERP v1.0 · 정밀 X-ray 장비 제조 재고 관리 시스템 · 11단계 공정 카테고리 기반 운영
          </p>
        </footer>
      </main>
    </div>
  );
}
