"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, History, X } from "lucide-react";
import { api, type TransactionLog } from "@/lib/api";
import { DesktopSidebar, type DesktopTabId } from "./DesktopSidebar";
import { DesktopTopbar } from "./DesktopTopbar";
import { DesktopInventoryView } from "./DesktopInventoryView";
import { DesktopWarehouseView } from "./DesktopWarehouseView";
import { DesktopAdminView } from "./DesktopAdminView";
import { LEGACY_COLORS, formatNumber, transactionColor, transactionLabel } from "./legacyUi";

const TAB_META: Record<DesktopTabId, { title: string; subtitle: string }> = {
  inventory: { title: "재고", subtitle: "Inventory Workspace" },
  warehouse: { title: "입출고 처리", subtitle: "Warehouse Operations" },
  admin: { title: "관리자", subtitle: "Admin Workspace" },
};

export function DesktopLegacyShell() {
  const [activeTab, setActiveTab] = useState<DesktopTabId>("inventory");
  const [status, setStatus] = useState("데스크톱 작업 화면을 준비했습니다.");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<TransactionLog[]>([]);
  const [refreshNonce, setRefreshNonce] = useState(0);

  async function loadHistory() {
    const next = await api.getTransactions({ limit: 40 });
    setHistory(next);
  }

  useEffect(() => {
    if (!historyOpen) return;
    void loadHistory().catch(() => setHistory([]));
  }, [historyOpen]);

  const activeMeta = TAB_META[activeTab];

  const content = useMemo(() => {
    const key = `${activeTab}-${refreshNonce}`;
    if (activeTab === "inventory") {
      return <DesktopInventoryView key={key} globalSearch="" onStatusChange={setStatus} />;
    }
    if (activeTab === "warehouse") {
      return <DesktopWarehouseView key={key} globalSearch="" onStatusChange={setStatus} />;
    }
    return <DesktopAdminView key={key} globalSearch="" onStatusChange={setStatus} />;
  }, [activeTab, refreshNonce]);

  return (
    <div className="hidden min-h-screen lg:block">
      <div className="relative flex min-h-screen" style={{ background: LEGACY_COLORS.bg, color: LEGACY_COLORS.text }}>
        <DesktopSidebar activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab)} />

        <div className="min-w-0 flex-1">
          <DesktopTopbar
            title={activeMeta.title}
            subtitle={activeMeta.subtitle}
            onRefresh={() => setRefreshNonce((current) => current + 1)}
            onToggleHistory={() => setHistoryOpen((current) => !current)}
            historyOpen={historyOpen}
            statusText={status}
          />
          <div className="min-h-[calc(100vh-108px)]">{content}</div>
        </div>

        {historyOpen ? (
          <div
            className="sticky top-0 z-30 h-screen w-[420px] shrink-0 overflow-hidden border-l px-5 py-5"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
          >
            <div
              className="desktop-shell-panel flex h-full min-h-0 flex-col px-5 py-5"
              style={{
                background: `linear-gradient(180deg, ${LEGACY_COLORS.panel} 0%, ${LEGACY_COLORS.s1} 100%)`,
                borderColor: LEGACY_COLORS.border,
              }}
            >
              <div className="mb-4 flex items-start justify-between border-b pb-4" style={{ borderColor: LEGACY_COLORS.border }}>
                <div>
                  <div className="desktop-section-label mb-2">Activity Feed</div>
                  <div className="text-[22px] font-black">입출고 이력</div>
                  <div className="mt-2 text-sm leading-6" style={{ color: LEGACY_COLORS.muted2 }}>
                    최근 40건의 거래 로그를 실시간 작업 패널처럼 빠르게 확인합니다.
                  </div>
                </div>
                <button
                  onClick={() => setHistoryOpen(false)}
                  className="rounded-2xl border p-2 transition"
                  style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="desktop-shell-subpanel px-4 py-4">
                  <div className="desktop-section-label mb-2">Rows</div>
                  <div className="font-mono text-[28px] font-black">{formatNumber(history.length)}</div>
                </div>
                <div className="desktop-shell-subpanel px-4 py-4">
                  <div className="desktop-section-label mb-2">Status</div>
                  <div className="text-sm leading-6">{status}</div>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                {history.map((log) => (
                  <div
                    key={log.log_id}
                    className="rounded-[24px] border p-4"
                    style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span
                        className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold"
                        style={{ background: "rgba(79, 142, 247, 0.14)", color: transactionColor(log.transaction_type) }}
                      >
                        <Activity className="h-3.5 w-3.5" />
                        {transactionLabel(log.transaction_type)}
                      </span>
                      <span className="font-mono text-sm font-black" style={{ color: transactionColor(log.transaction_type) }}>
                        {log.quantity_change >= 0 ? "+" : ""}
                        {formatNumber(log.quantity_change)}
                      </span>
                    </div>
                    <div className="text-sm font-semibold">{log.item_name}</div>
                    <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                      {log.item_code} / {new Date(log.created_at).toLocaleString("ko-KR")}
                    </div>
                    {log.produced_by ? (
                      <div className="mt-2 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                        담당자 {log.produced_by}
                      </div>
                    ) : null}
                    {log.notes ? <div className="mt-3 text-sm">{log.notes}</div> : null}
                  </div>
                ))}
                {history.length === 0 ? (
                  <div
                    className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-[24px] border px-6 py-8 text-center"
                    style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
                  >
                    <History className="mb-4 h-8 w-8" style={{ color: LEGACY_COLORS.muted2 }} />
                    <div className="text-base font-bold">최근 거래가 없습니다</div>
                    <div className="mt-2 max-w-[240px] text-sm leading-6" style={{ color: LEGACY_COLORS.muted2 }}>
                      입고, 출고, 조정 작업이 발생하면 이 패널에 최신 활동이 누적됩니다.
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
