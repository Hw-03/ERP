"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  ChevronRight,
  Layers,
  Package,
  RefreshCw,
  ScrollText,
  Spline,
} from "lucide-react";

import AppHeader from "@/components/AppHeader";
import CategoryCard from "@/components/CategoryCard";
import UKAlert from "@/components/UKAlert";
import { api, type InventorySummary, type TransactionLog } from "@/lib/api";

const FLOW_STAGES = [
  { label: "원자재", code: "RM", color: "text-slate-300" },
  { label: "튜브 공정", code: "TA / TF", color: "text-blue-300" },
  { label: "고압 공정", code: "HA / HF", color: "text-purple-300" },
  { label: "진공 공정", code: "VA / VF", color: "text-cyan-300" },
  { label: "조립 공정", code: "BA / BF", color: "text-indigo-300" },
  { label: "완제품", code: "FG", color: "text-emerald-300" },
];

const TX_TYPE_LABEL = {
  RECEIVE: "입고",
  PRODUCE: "생산 입고",
  SHIP: "출고",
  ADJUST: "조정",
  BACKFLUSH: "자동 차감",
};

const TX_TYPE_STYLE: Record<string, string> = {
  RECEIVE: "border-emerald-700/50 bg-emerald-950/40 text-emerald-300",
  PRODUCE: "border-blue-700/50 bg-blue-950/40 text-blue-300",
  SHIP: "border-orange-700/50 bg-orange-950/40 text-orange-300",
  ADJUST: "border-yellow-700/50 bg-yellow-950/40 text-yellow-300",
  BACKFLUSH: "border-purple-700/50 bg-purple-950/40 text-purple-300",
};

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  hint: string;
  color: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-400">{label}</p>
        <div className={`rounded-2xl p-2 ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="font-mono text-3xl font-bold text-slate-100">{value.toLocaleString()}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [transactions, setTransactions] = useState<TransactionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

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
          ? `데이터를 불러오지 못했습니다: ${err.message}`
          : "데이터를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 60_000);
    return () => clearInterval(timer);
  }, [loadData]);

  const mainCategories =
    summary?.categories.filter((category) => category.category !== "UK") ?? [];
  const ukCategory = summary?.categories.find((category) => category.category === "UK");

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950">
        <AppHeader />
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-14 w-14 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
            <p className="mt-4 text-sm text-slate-400">대시보드 데이터를 불러오는 중입니다.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <AppHeader />

      <main className="mx-auto max-w-screen-2xl px-6 py-8">
        {summary && summary.uk_item_count > 0 && <UKAlert count={summary.uk_item_count} />}

        <section className="rounded-[32px] border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 shadow-2xl">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Precision X-Ray Manufacturing
              </p>
              <h2 className="mt-3 text-4xl font-black tracking-tight text-slate-100">
                제조 공정 전체를 한 화면에서 관리합니다.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">
                이 대시보드는 정밀 X-ray 장비 제조 ERP의 중심 화면입니다. 11단계 카테고리 흐름,
                971개 품목의 재고 현황, 최근 거래 기록, 미분류 품목 경고를 한 번에 확인할 수
                있습니다.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/inventory"
                className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
              >
                품목 리스트 열기
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/history"
                className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-5 py-3 text-sm text-slate-300 transition hover:border-slate-600 hover:text-white"
              >
                거래 이력 보기
                <ScrollText className="h-4 w-4" />
              </Link>
              <Link
                href="/bom"
                className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-5 py-3 text-sm text-slate-300 transition hover:border-slate-600 hover:text-white"
              >
                BOM / 생산 관리
                <Spline className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-2">
            {FLOW_STAGES.map((stage, index) => (
              <div key={stage.code} className="flex items-center gap-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
                  <p className={`font-mono text-xs font-bold ${stage.color}`}>{stage.code}</p>
                  <p className="mt-1 text-xs text-slate-500">{stage.label}</p>
                </div>
                {index < FLOW_STAGES.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-slate-700" />
                )}
              </div>
            ))}
          </div>
        </section>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="mt-8 grid grid-cols-2 gap-4 xl:grid-cols-4">
          <KpiCard
            icon={Package}
            label="총 품목 수"
            value={summary?.total_items ?? 0}
            hint="ERP에 등록된 전체 품목"
            color="bg-blue-500/15 text-blue-300"
          />
          <KpiCard
            icon={Layers}
            label="총 재고 수량"
            value={Math.round(summary?.total_quantity ?? 0)}
            hint="전 카테고리 합산"
            color="bg-cyan-500/15 text-cyan-300"
          />
          <KpiCard
            icon={Activity}
            label="최근 거래 10건"
            value={transactions.length}
            hint="입고, 출고, 조정, 생산 포함"
            color="bg-emerald-500/15 text-emerald-300"
          />
          <KpiCard
            icon={AlertTriangle}
            label="미분류 품목"
            value={summary?.uk_item_count ?? 0}
            hint={
              (summary?.uk_item_count ?? 0) > 0 ? "우선 분류 필요" : "모든 품목 분류 완료"
            }
            color="bg-red-500/15 text-red-300"
          />
        </div>

        <section className="mt-8 rounded-[28px] border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold text-slate-100">카테고리별 재고 현황</h3>
              <p className="mt-1 text-sm text-slate-500">제조 공정 순서대로 정렬됩니다.</p>
            </div>
            <button
              onClick={loadData}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/80 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-700 hover:text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              새로고침
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            {mainCategories.map((category) => (
              <CategoryCard key={category.category} data={category} />
            ))}
          </div>

          {ukCategory && (
            <div className="mt-5 max-w-sm">
              <CategoryCard data={ukCategory} isAlert />
            </div>
          )}
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
          <div className="rounded-[28px] border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-slate-100">최근 거래 이력</h3>
                <p className="mt-1 text-sm text-slate-500">최근 10건을 빠르게 확인합니다.</p>
              </div>
              <Link
                href="/history"
                className="text-sm text-blue-300 transition hover:text-blue-200"
              >
                전체 보기
              </Link>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-800">
              <table className="w-full text-sm">
                <thead className="bg-slate-950/80">
                  <tr className="border-b border-slate-800">
                    <th className="px-4 py-3 text-left text-slate-500">유형</th>
                    <th className="px-4 py-3 text-left text-slate-500">품목</th>
                    <th className="px-4 py-3 text-right text-slate-500">변동</th>
                    <th className="px-4 py-3 text-right text-slate-500">시각</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                        표시할 거래 이력이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    transactions.map((tx, index) => (
                      <tr
                        key={tx.log_id}
                        className={`border-b border-slate-800/80 ${
                          index % 2 === 0 ? "bg-slate-900/30" : "bg-slate-900/10"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full border px-2 py-1 text-xs ${
                              TX_TYPE_STYLE[tx.transaction_type]
                            }`}
                          >
                            {TX_TYPE_LABEL[tx.transaction_type]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-100">{tx.item_name}</p>
                          <p className="mt-1 font-mono text-xs text-slate-500">{tx.item_code}</p>
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-mono ${
                            tx.quantity_change >= 0 ? "text-emerald-300" : "text-red-300"
                          }`}
                        >
                          {tx.quantity_change >= 0 ? "+" : ""}
                          {Number(tx.quantity_change).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-slate-500">
                          {new Date(tx.created_at).toLocaleString("ko-KR", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
            <h3 className="text-xl font-semibold text-slate-100">바로 가기</h3>
            <div className="mt-4 space-y-3">
              <Link
                href="/inventory?category=UK"
                className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4 transition hover:border-slate-700"
              >
                <div>
                  <p className="font-medium text-slate-100">미분류 품목 정리</p>
                  <p className="mt-1 text-sm text-slate-500">
                    UK 품목을 카테고리로 다시 분류합니다.
                  </p>
                </div>
                <Boxes className="h-5 w-5 text-red-300" />
              </Link>
              <Link
                href="/bom"
                className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4 transition hover:border-slate-700"
              >
                <div>
                  <p className="font-medium text-slate-100">BOM 및 생산 입고</p>
                  <p className="mt-1 text-sm text-slate-500">
                    BOM 구성과 Backflush 검증을 진행합니다.
                  </p>
                </div>
                <Spline className="h-5 w-5 text-blue-300" />
              </Link>
              <Link
                href="/history"
                className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4 transition hover:border-slate-700"
              >
                <div>
                  <p className="font-medium text-slate-100">전체 거래 로그 조회</p>
                  <p className="mt-1 text-sm text-slate-500">
                    입고, 출고, 조정, 생산 이력을 한 번에 확인합니다.
                  </p>
                </div>
                <ScrollText className="h-5 w-5 text-cyan-300" />
              </Link>
            </div>

            {lastUpdated && (
              <p className="mt-6 text-xs text-slate-600">
                마지막 갱신 {lastUpdated.toLocaleString("ko-KR")}
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
