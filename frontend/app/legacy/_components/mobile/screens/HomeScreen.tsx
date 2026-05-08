"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  Boxes,
  ClipboardList,
  History,
  Inbox,
  MoreHorizontal,
  Package,
} from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { api, type StockAlert, type StockRequest, type TransactionLog } from "@/lib/api";
import type { ToastState } from "@/lib/ui/Toast";
import { canEnterIO } from "../../_warehouse_steps";
import { useCurrentOperator } from "../../login/useCurrentOperator";
import type { TabId } from "../MobileShell";
import { TYPO } from "../tokens";
import {
  AsyncState,
  EmptyState,
  KpiCard,
  KpiRow,
  PersonAvatar,
  QuickActionGrid,
  SectionCard,
  SectionHeader,
} from "../primitives";
import { HistoryLogRow } from "./_history_parts/HistoryLogRow";

interface HomeData {
  todayCount: number;
  pendingCount: number;
  alertCount: number;
  recentTransactions: TransactionLog[];
  alerts: StockAlert[];
}

export function HomeScreen({
  showToast,
  onChangeTab,
}: {
  showToast: (toast: ToastState) => void;
  onChangeTab: (tab: TabId) => void;
}) {
  const operator = useCurrentOperator();
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  const load = async () => {
    if (!operator) return;
    setLoading(true);
    setError(null);
    try {
      const [recent, requests, alerts] = await Promise.all([
        api.getTransactions({ limit: 5 }),
        api.listMyStockRequests(operator.employee_id).catch<StockRequest[]>(() => []),
        api
          .listAlerts({ kind: "SAFETY", includeAcknowledged: false })
          .catch<StockAlert[]>(() => []),
      ]);

      const todayKey = new Date().toISOString().slice(0, 10);
      const todayCount = recent.filter((t) => t.created_at.startsWith(todayKey)).length;
      const pendingCount = requests.filter(
        (r) => r.status === "submitted" || r.status === "reserved",
      ).length;

      setData({
        todayCount,
        pendingCount,
        alertCount: alerts.length,
        recentTransactions: recent.slice(0, 5),
        alerts: alerts.slice(0, 5),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operator?.employee_id]);

  const ioEnabled = canEnterIO(operator);
  const quickActions = useMemo(
    () => [
      {
        id: "inventory",
        label: "재고 검색",
        description: "품목 검색·KPI",
        icon: Package,
        tone: LEGACY_COLORS.blue as string,
        onClick: () => onChangeTab("inventory"),
      },
      {
        id: "warehouse",
        label: "입출고",
        description: ioEnabled ? "창고 흐름 시작" : "권한 없음",
        icon: ArrowUpDown,
        tone: LEGACY_COLORS.green as string,
        disabled: !ioEnabled,
        onClick: () => onChangeTab("warehouse"),
      },
      {
        id: "history",
        label: "내역",
        description: "최근 거래·달력",
        icon: History,
        tone: LEGACY_COLORS.cyan as string,
        onClick: () => onChangeTab("history"),
      },
      {
        id: "more",
        label: "더보기",
        description: "주간보고·관리·로그아웃",
        icon: MoreHorizontal,
        tone: LEGACY_COLORS.muted as string,
        onClick: () => onChangeTab("more"),
      },
    ],
    [ioEnabled, onChangeTab],
  );

  const handleCopyRef = async (ref: string) => {
    try {
      await navigator.clipboard.writeText(ref);
      setCopiedRef(ref);
      showToast({ type: "info", message: `${ref} 복사됨` });
      setTimeout(() => setCopiedRef((c) => (c === ref ? null : c)), 1500);
    } catch {
      showToast({ type: "info", message: "복사 실패" });
    }
  };

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      {/* 인사말 + 작업자 */}
      <SectionCard className="flex items-center gap-3" padding="md">
        <PersonAvatar
          name={operator?.name ?? "—"}
          department={operator?.department}
          showLabel={false}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <div
            className={`${TYPO.caption} font-semibold uppercase tracking-[1.2px]`}
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            오늘도 안전 작업
          </div>
          <div
            className={`${TYPO.headline} truncate font-black`}
            style={{ color: LEGACY_COLORS.text }}
          >
            {operator?.name ?? "—"}
          </div>
          <div className={`${TYPO.caption}`} style={{ color: LEGACY_COLORS.muted2 }}>
            {operator?.department ?? ""}
            {operator?.warehouse_role && operator.warehouse_role !== "none"
              ? ` · 창고 ${operator.warehouse_role === "primary" ? "정" : "부"}`
              : ""}
          </div>
        </div>
      </SectionCard>

      {/* KPI */}
      <KpiRow>
        <KpiCard
          label="오늘 처리"
          value={loading ? "…" : formatQty(data?.todayCount ?? 0)}
          color={LEGACY_COLORS.blue as string}
        />
        <KpiCard
          label="승인 대기"
          value={loading ? "…" : formatQty(data?.pendingCount ?? 0)}
          color={LEGACY_COLORS.yellow as string}
        />
        <KpiCard
          label="재고 알림"
          value={loading ? "…" : formatQty(data?.alertCount ?? 0)}
          color={LEGACY_COLORS.red as string}
        />
      </KpiRow>

      {/* 빠른 실행 */}
      <div className="flex flex-col gap-2">
        <SectionHeader subtitle="Quick" title="빠른 실행" />
        <QuickActionGrid actions={quickActions} columns={2} />
      </div>

      {/* 최근 작업 */}
      <div className="flex flex-col gap-2">
        <SectionHeader
          subtitle="Recent"
          title="최근 작업"
          right={
            <button
              type="button"
              onClick={() => onChangeTab("history")}
              className={`${TYPO.caption} font-bold`}
              style={{ color: LEGACY_COLORS.blue as string }}
            >
              전체보기
            </button>
          }
        />
        <SectionCard padding="none">
          <AsyncState
            loading={loading}
            error={error}
            empty={!loading && (data?.recentTransactions.length ?? 0) === 0}
            emptyView={<EmptyState icon={Inbox} title="최근 거래 없음" />}
            onRetry={load}
          >
            <div
              className="flex flex-col divide-y"
              style={{ borderColor: LEGACY_COLORS.border as string }}
            >
              {data?.recentTransactions.map((log) => (
                <HistoryLogRow
                  key={log.log_id}
                  log={log}
                  copiedRef={copiedRef}
                  onCopy={handleCopyRef}
                />
              ))}
            </div>
          </AsyncState>
        </SectionCard>
      </div>

      {/* 재고 알림 */}
      <div className="flex flex-col gap-2 pb-4">
        <SectionHeader subtitle="Alerts" title="재고 경고" />
        <SectionCard padding="none">
          <AsyncState
            loading={loading}
            error={null}
            empty={!loading && (data?.alerts.length ?? 0) === 0}
            emptyView={<EmptyState icon={Boxes} title="현재 경고 없음" />}
          >
            <div
              className="flex flex-col divide-y"
              style={{ borderColor: LEGACY_COLORS.border as string }}
            >
              {data?.alerts.map((alert) => (
                <button
                  key={alert.alert_id}
                  type="button"
                  onClick={() => onChangeTab("inventory")}
                  className="flex items-center gap-3 px-4 py-3 text-left active:bg-black/10"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px]"
                    style={{
                      background: `${LEGACY_COLORS.yellow as string}22`,
                      color: LEGACY_COLORS.yellow as string,
                    }}
                  >
                    <AlertTriangle size={18} strokeWidth={1.85} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`${TYPO.body} truncate font-black`}
                      style={{ color: LEGACY_COLORS.text }}
                    >
                      {alert.item_name ?? alert.erp_code ?? "품목"}
                    </div>
                    <div
                      className={`${TYPO.caption} truncate`}
                      style={{ color: LEGACY_COLORS.muted2 }}
                    >
                      {alert.message ??
                        (alert.threshold != null && alert.observed_value != null
                          ? `현재 ${formatQty(alert.observed_value)} / 안전 ${formatQty(alert.threshold)}`
                          : "안전 재고 미만")}
                    </div>
                  </div>
                  <ClipboardList size={16} color={LEGACY_COLORS.muted as string} />
                </button>
              ))}
            </div>
          </AsyncState>
        </SectionCard>
      </div>
    </div>
  );
}
