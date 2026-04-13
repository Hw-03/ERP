"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  AlertTriangle,
  ArchiveX,
  Boxes,
  Building2,
  PackageSearch,
  RefreshCw,
  Zap,
} from "lucide-react";

import AppHeader from "@/components/AppHeader";
import { api, type Item, type TransactionLog } from "@/lib/api";

// ─── Constants ────────────────────────────────────────────────────────────────

const PROCESS_STAGES: {
  label: string;
  codes: string[];
  color: string;
  dot: string;
  categoryParam: string;
}[] = [
  { label: "원자재",  codes: ["RM"],       color: "text-slate-300",   dot: "bg-slate-400",   categoryParam: "RM" },
  { label: "튜브",   codes: ["TA", "TF"], color: "text-blue-300",    dot: "bg-blue-400",    categoryParam: "TA" },
  { label: "고압",   codes: ["HA", "HF"], color: "text-purple-300",  dot: "bg-purple-400",  categoryParam: "HA" },
  { label: "진공",   codes: ["VA", "VF"], color: "text-cyan-300",    dot: "bg-cyan-400",    categoryParam: "VA" },
  { label: "조립",   codes: ["BA", "BF"], color: "text-indigo-300",  dot: "bg-indigo-400",  categoryParam: "BA" },
  { label: "완제품", codes: ["FG"],       color: "text-emerald-300", dot: "bg-emerald-400", categoryParam: "FG" },
];

const TX_TYPE_LABEL: Record<string, string> = {
  RECEIVE: "입고", PRODUCE: "생산입고", SHIP: "출고", ADJUST: "조정", BACKFLUSH: "자동차감",
};

const TX_TYPE_STYLE: Record<string, string> = {
  RECEIVE:   "border-emerald-700/50 bg-emerald-950/40 text-emerald-300",
  PRODUCE:   "border-blue-700/50   bg-blue-950/40    text-blue-300",
  SHIP:      "border-orange-700/50 bg-orange-950/40  text-orange-300",
  ADJUST:    "border-yellow-700/50 bg-yellow-950/40  text-yellow-300",
  BACKFLUSH: "border-purple-700/50 bg-purple-950/40  text-purple-300",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildTrendData(transactions: TransactionLog[]) {
  const days: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const map: Record<string, { receive: number; ship: number }> = {};
  for (const day of days) map[day] = { receive: 0, ship: 0 };

  for (const tx of transactions) {
    const date = tx.created_at.slice(0, 10);
    if (!map[date]) continue;
    const qty = Math.abs(Number(tx.quantity_change));
    if (tx.transaction_type === "RECEIVE" || tx.transaction_type === "PRODUCE") {
      map[date].receive += qty;
    } else if (tx.transaction_type === "SHIP" || tx.transaction_type === "BACKFLUSH") {
      map[date].ship += qty;
    }
  }

  return days.map((day) => ({
    date: day.slice(5).replace("-", "/"),
    receive: Math.round(map[day].receive),
    ship: Math.round(map[day].ship),
  }));
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [transactions, setTransactions] = useState<TransactionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    try {
      setRefreshing(true);
      const [itemsData, txData] = await Promise.all([
        api.getItems({ limit: 2000 }),
        api.getTransactions({ limit: 200 }),
      ]);
      setItems(itemsData);
      setTransactions(txData);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    const timer = setInterval(() => void loadData(), 60_000);
    return () => clearInterval(timer);
  }, [loadData]);

  // ── 재고 상태 집계 ──
  const { zeroItems, safetyItems, normalItems } = useMemo(() => {
    const zero: Item[] = [], safety: Item[] = [], normal: Item[] = [];
    for (const item of items) {
      const qty = Number(item.quantity);
      const min = item.min_stock ? Number(item.min_stock) : 10;
      if (qty <= 0) zero.push(item);
      else if (qty < min) safety.push(item);
      else normal.push(item);
    }
    return { zeroItems: zero, safetyItems: safety, normalItems: normal };
  }, [items]);

  // ── 공정별 위험도 ──
  const processDanger = useMemo(() =>
    PROCESS_STAGES.map((stage) => {
      const stageItems = items.filter((i) => stage.codes.includes(i.category));
      const zero = stageItems.filter((i) => Number(i.quantity) <= 0).length;
      const danger = stageItems.filter((i) => {
        const qty = Number(i.quantity);
        const min = i.min_stock ? Number(i.min_stock) : 10;
        return qty > 0 && qty < min;
      }).length;
      return { ...stage, total: stageItems.length, zero, danger };
    }), [items]);

  // ── 7일 트렌드 ──
  const trendData = useMemo(() => buildTrendData(transactions), [transactions]);

  // ── 오늘 집계 ──
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayTx = transactions.filter((tx) => tx.created_at.slice(0, 10) === todayStr);
  const todayReceive = todayTx.filter((tx) => tx.transaction_type === "RECEIVE" || tx.transaction_type === "PRODUCE").length;
  const todayShip    = todayTx.filter((tx) => tx.transaction_type === "SHIP"    || tx.transaction_type === "BACKFLUSH").length;

  // ── 즉시 조치 목록 (품절 상위 8, min_stock 높은 순) ──
  const criticalItems = useMemo(() =>
    [...zeroItems]
      .sort((a, b) => Number(b.min_stock ?? 0) - Number(a.min_stock ?? 0))
      .slice(0, 8),
    [zeroItems]);

  const recentTx = transactions.slice(0, 10);

  // ─ Loading ─
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950">
        <AppHeader />
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-14 w-14 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
            <p className="mt-4 text-sm text-slate-400">대시보드를 불러오는 중입니다.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AppHeader />

      <main className="mx-auto max-w-screen-2xl space-y-5 px-6 py-6">

        {error && (
          <div className="rounded-2xl border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* ── Zone 1: 재고 경보 카드 ── */}
        <section className="grid grid-cols-2 gap-4 xl:grid-cols-[1fr_1fr_1fr_auto]">
          {/* 품절 */}
          <Link
            href="/inventory?filter=ZERO"
            className="flex items-center gap-4 rounded-3xl border border-red-500/20 bg-slate-950/70 px-5 py-5 transition hover:border-red-400/40 hover:bg-slate-900"
          >
            <div className="flex h-13 w-13 shrink-0 animate-pulse items-center justify-center rounded-2xl bg-red-500/15 text-red-300">
              <ArchiveX className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-red-300/80">생산 중단 위기</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-slate-50">
                {zeroItems.length}
                <span className="ml-1 text-base font-normal text-slate-400">품목</span>
              </p>
              <p className="text-xs text-slate-500">품절 (현재고 = 0)</p>
            </div>
          </Link>

          {/* 발주필요 */}
          <Link
            href="/inventory?filter=SAFETY"
            className="flex items-center gap-4 rounded-3xl border border-amber-500/20 bg-slate-950/70 px-5 py-5 transition hover:border-amber-400/40 hover:bg-slate-900"
          >
            <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-300/80">발주 필요</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-slate-50">
                {safetyItems.length}
                <span className="ml-1 text-base font-normal text-slate-400">품목</span>
              </p>
              <p className="text-xs text-slate-500">안전재고 이하</p>
            </div>
          </Link>

          {/* 정상 */}
          <Link
            href="/inventory"
            className="flex items-center gap-4 rounded-3xl border border-emerald-500/20 bg-slate-950/70 px-5 py-5 transition hover:border-emerald-400/40 hover:bg-slate-900"
          >
            <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300">
              <Boxes className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300/80">정상</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-slate-50">
                {normalItems.length}
                <span className="ml-1 text-base font-normal text-slate-400">품목</span>
              </p>
              <p className="text-xs text-slate-500">총 {items.length}개 중</p>
            </div>
          </Link>

          {/* 새로고침 & 갱신 시각 */}
          <div className="col-span-2 flex items-center justify-between rounded-3xl border border-slate-800 bg-slate-950/70 px-5 py-5 xl:col-span-1 xl:flex-col xl:items-end xl:justify-between">
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-600 hover:text-white disabled:opacity-40"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              새로고침
            </button>
            {lastUpdated && (
              <p className="text-xs text-slate-600">
                갱신 {lastUpdated.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
        </section>

        {/* ── Capacity Row (백엔드 연결 대기) ── */}
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {[
            {
              Icon: Zap,
              label: "⚡ 즉시생산 (Fast Track)",
              desc: "반제품 재고 기준 즉시 조립 가능 수량",
              color: "text-blue-300",
              bg: "bg-blue-500/10",
              border: "border-blue-500/15",
            },
            {
              Icon: Building2,
              label: "🏭 최대생산 (Max Track)",
              desc: "원자재까지 전개한 이론상 최대 생산 수량",
              color: "text-cyan-300",
              bg: "bg-cyan-500/10",
              border: "border-cyan-500/15",
            },
            {
              Icon: AlertTriangle,
              label: "⚠️ 병목 원인",
              desc: "생산 수량을 제한하는 핵심 자재",
              color: "text-amber-300",
              bg: "bg-amber-500/10",
              border: "border-amber-500/15",
            },
          ].map(({ Icon, label, desc, color, bg, border }) => (
            <div
              key={label}
              className={`flex items-center gap-4 rounded-3xl border ${border} bg-slate-950/70 px-5 py-4`}
            >
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${bg} ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className={`text-sm font-semibold ${color}`}>{label}</p>
                <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
                <p className="mt-1 text-xs text-slate-600 italic">백엔드 연결 준비 중</p>
              </div>
            </div>
          ))}
        </section>

        {/* ── Zone 2+3: 공정 위험도 + 7일 추이 ── */}
        <section className="grid gap-5 xl:grid-cols-2">

          {/* 공정별 위험도 */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">공정별 재고 위험도</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-50">공정 단계 현황</h3>
            <div className="mt-4 space-y-1">
              <div className="grid grid-cols-[130px_1fr_52px_52px] gap-2 border-b border-slate-800 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <span>공정</span>
                <span className="pl-1">위험도</span>
                <span className="text-center text-amber-400/80">발주</span>
                <span className="text-center text-red-400/80">품절</span>
              </div>
              {processDanger.map((stage) => {
                const dangerRatio = stage.total > 0 ? (stage.danger + stage.zero) / stage.total : 0;
                return (
                  <Link
                    key={stage.label}
                    href={`/inventory?category=${stage.categoryParam}`}
                    className="grid grid-cols-[130px_1fr_52px_52px] items-center gap-2 rounded-2xl px-2 py-2.5 transition hover:bg-slate-900"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${stage.dot}`} />
                      <span className={`text-sm font-medium ${stage.color}`}>{stage.label}</span>
                    </div>
                    <div className="flex items-center gap-2 pl-1">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className={`h-full rounded-full transition-all ${dangerRatio > 0.3 ? "bg-red-400/60" : dangerRatio > 0.1 ? "bg-amber-400/60" : "bg-emerald-400/40"}`}
                          style={{ width: `${Math.min(dangerRatio * 100, 100)}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-xs text-slate-500">{stage.total}</span>
                    </div>
                    <span className={`text-center text-sm font-semibold tabular-nums ${stage.danger > 0 ? "text-amber-300" : "text-slate-700"}`}>
                      {stage.danger}
                    </span>
                    <span className={`text-center text-sm font-semibold tabular-nums ${stage.zero > 0 ? "text-red-300" : "text-slate-700"}`}>
                      {stage.zero}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* 7일 입출고 추이 */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">입출고 추이</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-50">최근 7일</h3>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-3 rounded-sm bg-emerald-500" />입고
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-3 rounded-sm bg-orange-500" />출고
                </span>
              </div>
            </div>

            <div className="mt-4 h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} barCategoryGap="35%">
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0f172a",
                      border: "1px solid #1e293b",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "#94a3b8" }}
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  />
                  <Bar dataKey="receive" name="입고" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="ship"    name="출고" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-800 pt-3">
              <div className="text-center">
                <p className="text-xs text-slate-500">오늘 입고</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-300">{todayReceive}건</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-500">오늘 출고</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-orange-300">{todayShip}건</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-500">오늘 합계</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-300">{todayTx.length}건</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Zone 4+5: 즉시 조치 + 최근 거래 ── */}
        <section className="grid gap-5 xl:grid-cols-2">

          {/* 즉시 조치 필요 */}
          <div className="rounded-3xl border border-red-900/30 bg-slate-950/70 p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-red-400/80">즉시 조치 필요</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-50">
                  품절 품목
                  <span className="ml-2 text-sm font-normal text-slate-400">상위 {criticalItems.length}개</span>
                </h3>
              </div>
              <Link href="/inventory?filter=ZERO" className="text-xs text-blue-300 hover:text-blue-200">
                전체 보기
              </Link>
            </div>

            <div className="mt-4 space-y-2">
              {criticalItems.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-slate-500">
                  <PackageSearch className="h-10 w-10 opacity-30" />
                  <p className="mt-3 text-sm">품절 품목이 없습니다.</p>
                </div>
              ) : (
                criticalItems.map((item) => (
                  <Link
                    key={item.item_id}
                    href={`/inventory?item=${item.item_id}`}
                    className="flex items-center justify-between rounded-2xl border border-slate-800/80 bg-slate-900/40 px-4 py-3 transition hover:border-red-900/50 hover:bg-slate-900"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300">
                          품절
                        </span>
                        <p className="truncate text-sm font-medium text-slate-100">{item.item_name}</p>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {item.supplier ?? "공급사 미등록"} · {item.item_code}
                      </p>
                    </div>
                    <div className="ml-4 shrink-0 text-right">
                      <p className="font-mono text-sm font-semibold text-red-300">0</p>
                      <p className="text-xs text-slate-500">
                        최소 {item.min_stock ? Number(item.min_stock).toLocaleString() : "—"}
                      </p>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* 최근 거래 이력 */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">거래 이력</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-50">최근 10건</h3>
              </div>
              <Link href="/history" className="text-xs text-blue-300 hover:text-blue-200">
                전체 보기
              </Link>
            </div>

            <div className="mt-4 space-y-2">
              {recentTx.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-500">거래 이력이 없습니다.</p>
              ) : (
                recentTx.map((tx) => (
                  <div
                    key={tx.log_id}
                    className="flex items-center gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/40 px-4 py-3"
                  >
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${TX_TYPE_STYLE[tx.transaction_type] ?? ""}`}
                    >
                      {TX_TYPE_LABEL[tx.transaction_type] ?? tx.transaction_type}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-100">{tx.item_name}</p>
                      <p className="text-xs text-slate-500">{tx.item_code}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`font-mono text-sm font-semibold ${tx.quantity_change >= 0 ? "text-emerald-300" : "text-orange-300"}`}>
                        {tx.quantity_change >= 0 ? "+" : ""}
                        {Number(tx.quantity_change).toLocaleString()}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(tx.created_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
