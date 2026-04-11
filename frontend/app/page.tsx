"use client";

/**
 * X-Ray ERP — 메인 대시보드
 *
 * BoxHero 스타일 카드 UI + 산업용 X-ray 테마 (Slate/Blue)
 * 11단계 카테고리별 재고 현황을 제조 흐름 순서로 표시
 * UK 미분류 자재 경고창 상단 고정
 */

import { useEffect, useState, useCallback } from "react";
import {
  Package,
  Layers,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Activity,
  Zap,
  ChevronRight,
} from "lucide-react";
import CategoryCard from "@/components/CategoryCard";
import UKAlert from "@/components/UKAlert";
import { api, type InventorySummary, type TransactionLog } from "@/lib/api";

// ---------------------------------------------------------------------------
// 제조 흐름 시각화 데이터
// ---------------------------------------------------------------------------

const FLOW_STAGES = [
  { label: "원자재", code: "RM", color: "text-slate-400" },
  { label: "튜브 공정", code: "TA→TF", color: "text-blue-400" },
  { label: "고압 공정", code: "HA→HF", color: "text-purple-400" },
  { label: "진공 공정", code: "VA→VF", color: "text-cyan-400" },
  { label: "조립 공정", code: "BA→BF", color: "text-indigo-400" },
  { label: "출하", code: "FG", color: "text-green-400" },
];

// ---------------------------------------------------------------------------
// KPI 카드
// ---------------------------------------------------------------------------

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
    <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-4 shadow-md">
      <div className="flex items-center justify-between mb-3">
        <span className="text-slate-400 text-sm font-medium">{label}</span>
        <div className={`w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className={`text-3xl font-bold font-mono ${color}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 최근 트랜잭션 뱃지
// ---------------------------------------------------------------------------

const TX_TYPE_STYLE: Record<string, string> = {
  RECEIVE:   "bg-green-900/50 text-green-300 border-green-700/50",
  PRODUCE:   "bg-blue-900/50 text-blue-300 border-blue-700/50",
  SHIP:      "bg-orange-900/50 text-orange-300 border-orange-700/50",
  ADJUST:    "bg-yellow-900/50 text-yellow-300 border-yellow-700/50",
  BACKFLUSH: "bg-purple-900/50 text-purple-300 border-purple-700/50",
};

const TX_TYPE_LABEL: Record<string, string> = {
  RECEIVE:   "입고",
  PRODUCE:   "생산",
  SHIP:      "출하",
  ADJUST:    "조정",
  BACKFLUSH: "자동차감",
};

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

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
          : "데이터를 불러올 수 없습니다. 백엔드 서버가 실행 중인지 확인하세요."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // 60초마다 자동 갱신
    const interval = setInterval(loadData, 60_000);
    return () => clearInterval(interval);
  }, [loadData]);

  // UK가 없는 카테고리 (FG 제외)
  const mainCategories = summary?.categories.filter((c) => c.category !== "UK") ?? [];
  const ukCategory = summary?.categories.find((c) => c.category === "UK");

  const totalQty = summary?.total_quantity ?? 0;

  // ---------------------------------------------------------------------------
  // Loading State
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm">ERP 데이터 로딩 중...</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error State
  // ---------------------------------------------------------------------------

  if (error && !summary) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-800 border border-red-800/50 rounded-2xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-100 mb-2">연결 오류</h2>
          <p className="text-slate-400 text-sm mb-6">{error}</p>
          <div className="bg-slate-900 rounded-lg p-4 text-left mb-6">
            <p className="text-slate-500 text-xs font-mono">
              $ cd backend<br />
              $ uvicorn app.main:app --reload
            </p>
          </div>
          <button onClick={loadData} className="btn-primary w-full">
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main Dashboard UI
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-slate-950">
      {/* ── 상단 네비게이션 바 ── */}
      <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/80 shadow-lg">
        <div className="max-w-screen-2xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* 로고 */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-md shadow-blue-900/50">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-100 leading-none">
                X-Ray ERP
              </h1>
              <p className="text-slate-500 text-xs leading-none mt-0.5">
                재고 관리 시스템
              </p>
            </div>
          </div>

          {/* 우측 상태 */}
          <div className="flex items-center gap-4">
            {/* UK 경고 배지 */}
            {(summary?.uk_item_count ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 text-red-400 text-sm">
                <AlertTriangle className="w-4 h-4 animate-pulse" />
                <span className="font-medium">
                  미분류 {summary?.uk_item_count}건
                </span>
              </div>
            )}

            {/* 마지막 업데이트 */}
            {lastUpdated && (
              <span className="text-slate-600 text-xs hidden sm:block">
                {lastUpdated.toLocaleTimeString("ko-KR")} 갱신
              </span>
            )}

            {/* 새로고침 */}
            <button
              onClick={loadData}
              disabled={refreshing}
              className="p-2 text-slate-400 hover:text-slate-200 transition-colors rounded-lg
                         hover:bg-slate-800 disabled:opacity-50"
              aria-label="데이터 새로고침"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      {/* ── 메인 콘텐츠 ── */}
      <main className="max-w-screen-2xl mx-auto px-6 py-8">

        {/* ── UK 미분류 경고 (최우선 표시) ── */}
        {(summary?.uk_item_count ?? 0) > 0 && (
          <UKAlert count={summary!.uk_item_count} />
        )}

        {/* ── API 오류 배너 (데이터는 있지만 새로고침 실패 시) ── */}
        {error && summary && (
          <div className="mb-4 bg-amber-900/30 border border-amber-700/50 rounded-lg px-4 py-2 text-amber-400 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error} — 캐시 데이터 표시 중</span>
          </div>
        )}

        {/* ── 제조 흐름 시각화 ── */}
        <div className="mb-8">
          <div className="flex items-center gap-1 flex-wrap">
            {FLOW_STAGES.map((stage, i) => (
              <div key={stage.code} className="flex items-center gap-1">
                <div className="bg-slate-800/60 border border-slate-700/40 rounded-lg px-3 py-1.5 text-center">
                  <p className={`text-xs font-bold font-mono ${stage.color}`}>
                    {stage.code}
                  </p>
                  <p className="text-slate-500 text-xs mt-0.5">{stage.label}</p>
                </div>
                {i < FLOW_STAGES.length - 1 && (
                  <ChevronRight className="w-4 h-4 text-slate-600 flow-arrow flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── KPI 카드 ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <KpiCard
            icon={Package}
            label="총 품목 수"
            value={summary?.total_items ?? 0}
            sub="등록된 전체 품목"
            color="text-blue-400"
          />
          <KpiCard
            icon={Layers}
            label="총 재고량"
            value={Math.round(totalQty).toLocaleString()}
            sub="전체 카테고리 합산 (EA)"
            color="text-cyan-400"
          />
          <KpiCard
            icon={Activity}
            label="오늘 트랜잭션"
            value={
              transactions.filter((t) => {
                const d = new Date(t.created_at);
                const today = new Date();
                return d.toDateString() === today.toDateString();
              }).length
            }
            sub="입고/생산/출하 합계"
            color="text-green-400"
          />
          <KpiCard
            icon={AlertTriangle}
            label="미분류 자재"
            value={summary?.uk_item_count ?? 0}
            sub={
              (summary?.uk_item_count ?? 0) > 0
                ? "⚠️ 카테고리 재지정 필요"
                : "✅ 모두 분류됨"
            }
            color={
              (summary?.uk_item_count ?? 0) > 0 ? "text-red-400" : "text-green-400"
            }
          />
        </div>

        {/* ── 카테고리별 재고 현황 그리드 ── */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">
                카테고리별 재고 현황
              </h2>
              <p className="text-slate-500 text-sm mt-0.5">
                제조 공정 흐름 순서 (RM → FG)
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-slate-500 text-xs">실시간</span>
            </div>
          </div>

          {/* 메인 카테고리 카드 (UK 제외) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {mainCategories.map((cat) => (
              <CategoryCard key={cat.category} data={cat} />
            ))}
          </div>
        </div>

        {/* ── UK 미분류 별도 섹션 ── */}
        {ukCategory && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <h3 className="text-sm font-semibold text-red-400">
                미분류 자재 현황 (UK)
              </h3>
            </div>
            <div className="max-w-xs">
              <CategoryCard data={ukCategory} isAlert />
            </div>
          </div>
        )}

        {/* ── 최근 트랜잭션 ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-100">
              최근 거래 이력
            </h2>
            <span className="text-slate-500 text-xs">최근 10건</span>
          </div>

          {transactions.length === 0 ? (
            <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-8 text-center">
              <TrendingUp className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">거래 이력이 없습니다.</p>
              <p className="text-slate-600 text-xs mt-1">
                입고 / 생산 / 출하 처리 후 여기에 표시됩니다.
              </p>
            </div>
          ) : (
            <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/60 bg-slate-900/40">
                    <th className="text-left text-slate-400 font-medium px-4 py-3">유형</th>
                    <th className="text-left text-slate-400 font-medium px-4 py-3">품목</th>
                    <th className="text-right text-slate-400 font-medium px-4 py-3">수량 변동</th>
                    <th className="text-left text-slate-400 font-medium px-4 py-3 hidden md:table-cell">
                      참조번호
                    </th>
                    <th className="text-right text-slate-400 font-medium px-4 py-3 hidden lg:table-cell">
                      처리 일시
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx, idx) => {
                    const isPositive = Number(tx.quantity_change) > 0;
                    return (
                      <tr
                        key={tx.log_id}
                        className={`border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors ${
                          idx % 2 === 0 ? "" : "bg-slate-900/20"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <span
                            className={`badge border text-xs px-2 py-0.5 rounded-full ${
                              TX_TYPE_STYLE[tx.transaction_type] ??
                              "bg-slate-700 text-slate-300 border-slate-600"
                            }`}
                          >
                            {TX_TYPE_LABEL[tx.transaction_type] ?? tx.transaction_type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-300 font-mono text-xs">
                            {tx.item_id.slice(0, 8)}…
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
                        <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell">
                          {tx.reference_no ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs text-right hidden lg:table-cell">
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

        {/* ── 푸터 ── */}
        <footer className="mt-12 pt-6 border-t border-slate-800/60 text-center">
          <p className="text-slate-600 text-xs">
            X-Ray ERP v1.0 · 정밀 X-ray 장비 제조 재고 관리 시스템
            · 11단계 공정 카테고리 (RM→TA→TF→HA→HF→VA→VF→BA→BF→FG)
          </p>
        </footer>
      </main>
    </div>
  );
}
