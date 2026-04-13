"use client";

import { useEffect, useMemo, useState } from "react";
import { History, X } from "lucide-react";
import { api, type TransactionLog } from "@/lib/api";
import { DesktopSidebar, type DesktopTabId } from "./DesktopSidebar";
import { DesktopTopbar } from "./DesktopTopbar";
import { DesktopInventoryView } from "./DesktopInventoryView";
import { DesktopWarehouseView } from "./DesktopWarehouseView";
import { DesktopAdminView } from "./DesktopAdminView";
import { LEGACY_COLORS, formatNumber, transactionColor, transactionLabel } from "./legacyUi";

const TAB_META: Record<DesktopTabId, { title: string; subtitle: string }> = {
  inventory: { title: "", subtitle: "" },
  warehouse: { title: "", subtitle: "" },
  admin: { title: "관리자", subtitle: "Admin Workspace" },
};

export function DesktopLegacyShell() {
  const [activeTab, setActiveTab] = useState<DesktopTabId>("inventory");
  const [search, setSearch] = useState("");
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
      return <DesktopInventoryView key={key} globalSearch={search} onStatusChange={setStatus} />;
    }
    if (activeTab === "warehouse") {
      return <DesktopWarehouseView key={key} globalSearch={search} onStatusChange={setStatus} />;
    }
    return <DesktopAdminView key={key} globalSearch={search} onStatusChange={setStatus} />;
  }, [activeTab, refreshNonce, search]);

  return (
    <div className="hidden min-h-screen bg-black lg:block">
      <div className="relative flex min-h-screen" style={{ background: LEGACY_COLORS.bg, color: LEGACY_COLORS.text }}>
        <DesktopSidebar activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab)} />

        <div className="min-w-0 flex-1">
          <DesktopTopbar
            title={activeMeta.title}
            subtitle={activeMeta.subtitle}
            search={search}
            onSearchChange={setSearch}
            onRefresh={() => setRefreshNonce((current) => current + 1)}
            onToggleHistory={() => setHistoryOpen((current) => !current)}
            historyOpen={historyOpen}
            statusText={status}
          />
          <div className="min-h-[calc(100vh-108px)]">{content}</div>
        </div>

        {historyOpen ? (
          <div
            className="sticky top-0 z-30 h-screen w-[420px] shrink-0 overflow-hidden border-l px-5 py-5 shadow-2xl"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-lg font-black">입출고 이력</div>
                <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  최근 40건의 거래 기록을 빠르게 확인합니다.
                </div>
              </div>
              <button
                onClick={() => setHistoryOpen(false)}
                className="rounded-2xl border p-2"
                style={{ borderColor: LEGACY_COLORS.border }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-4 rounded-3xl border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
              <div className="mb-2 flex items-center gap-2 text-sm font-bold">
                <History className="h-4 w-4" />
                최근 요약
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl px-3 py-3" style={{ background: LEGACY_COLORS.s1 }}>
                  <div className="mb-1 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                    건수
                  </div>
                  <div className="font-mono text-xl font-black">{formatNumber(history.length)}</div>
                </div>
                <div className="rounded-2xl px-3 py-3" style={{ background: LEGACY_COLORS.s1 }}>
                  <div className="mb-1 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                    마지막 상태
                  </div>
                  <div className="text-xs leading-5">{status}</div>
                </div>
              </div>
            </div>

            <div className="h-[calc(100vh-180px)] space-y-2 overflow-y-auto pb-6">
              {history.map((log) => (
                <div
                  key={log.log_id}
                  className="rounded-3xl border p-4"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span
                      className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                      style={{ background: "rgba(79,142,247,.14)", color: transactionColor(log.transaction_type) }}
                    >
                      {transactionLabel(log.transaction_type)}
                    </span>
                    <span className="font-mono text-sm font-bold" style={{ color: transactionColor(log.transaction_type) }}>
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
                  {log.notes ? <div className="mt-2 text-sm">{log.notes}</div> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
