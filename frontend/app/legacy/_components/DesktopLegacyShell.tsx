"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, History, Pencil, X } from "lucide-react";
import { api, type TransactionLog } from "@/lib/api";
import { DesktopSidebar, type DesktopTabId } from "./DesktopSidebar";
import { DesktopTopbar } from "./DesktopTopbar";
import { DesktopInventoryView } from "./DesktopInventoryView";
import { DesktopWarehouseView } from "./DesktopWarehouseView";
import { DesktopDeptView } from "./DesktopDeptView";
import { DesktopAdminView } from "./DesktopAdminView";
import { LEGACY_COLORS, formatNumber, transactionColor, transactionLabel } from "./legacyUi";

const TAB_META: Record<DesktopTabId, { title: string; subtitle: string }> = {
  inventory: { title: "재고", subtitle: "Inventory Workspace" },
  warehouse: { title: "창고입출고", subtitle: "Warehouse Workspace" },
  dept: { title: "부서입출고", subtitle: "Department Workspace" },
  admin: { title: "관리자", subtitle: "Admin Workspace" },
};

export function DesktopLegacyShell() {
  const [activeTab, setActiveTab] = useState<DesktopTabId>("inventory");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("데스크톱 작업대를 준비했습니다.");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<TransactionLog[]>([]);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState("");

  async function loadHistory() {
    const next = await api.getTransactions({ limit: 40 });
    setHistory(next);
  }

  useEffect(() => {
    if (!historyOpen) return;
    void loadHistory().catch(() => setHistory([]));
  }, [historyOpen]);

  async function saveNotes(logId: string) {
    try {
      const updated = await api.updateTransactionNotes(logId, editingNotes.trim() || null);
      setHistory((current) => current.map((log) => (log.log_id === logId ? updated : log)));
    } catch {
      // ignore
    } finally {
      setEditingLogId(null);
    }
  }

  const activeMeta = TAB_META[activeTab];

  const content = useMemo(() => {
    const key = `${activeTab}-${refreshNonce}`;
    if (activeTab === "inventory") {
      return <DesktopInventoryView key={key} globalSearch={search} onStatusChange={setStatus} />;
    }
    if (activeTab === "warehouse") {
      return <DesktopWarehouseView key={key} globalSearch={search} onStatusChange={setStatus} />;
    }
    if (activeTab === "dept") {
      return <DesktopDeptView key={key} globalSearch={search} onStatusChange={setStatus} />;
    }
    return <DesktopAdminView key={key} globalSearch={search} onStatusChange={setStatus} />;
  }, [activeTab, refreshNonce, search]);

  return (
    <div className="hidden min-h-screen bg-black lg:block">
      <div
        className="relative flex h-screen overflow-hidden"
        style={{ background: LEGACY_COLORS.bg, color: LEGACY_COLORS.text }}
      >
        <DesktopSidebar activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab)} />

        <div className="flex min-w-0 flex-1 flex-col">
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
          <div className="min-h-0 flex-1 overflow-hidden">{content}</div>
        </div>

        {historyOpen ? (
          <div
            className="absolute inset-y-0 right-0 z-30 flex w-[400px] flex-col border-l shadow-2xl"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
          >
            {/* Header */}
            <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[15px] font-black">입출고 내역</div>
                  <div className="mt-0.5 text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                    최근 40건 · 비고 클릭으로 수정
                  </div>
                </div>
                <button
                  onClick={() => setHistoryOpen(false)}
                  className="rounded-xl border p-1.5 transition"
                  style={{ borderColor: LEGACY_COLORS.border }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Summary */}
            <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl px-3 py-2" style={{ background: LEGACY_COLORS.s2 }}>
                  <div className="mb-0.5 text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>건수</div>
                  <div className="flex items-center gap-1.5">
                    <History className="h-3 w-3" style={{ color: LEGACY_COLORS.muted2 }} />
                    <span className="font-mono text-[15px] font-black">{formatNumber(history.length)}</span>
                  </div>
                </div>
                <div className="rounded-xl px-3 py-2" style={{ background: LEGACY_COLORS.s2 }}>
                  <div className="mb-0.5 text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>마지막 상태</div>
                  <div className="truncate text-[11px] leading-4">{status}</div>
                </div>
              </div>
            </div>

            {/* Log list */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <div className="space-y-1.5">
                {history.map((log) => {
                  const isEditing = editingLogId === log.log_id;
                  return (
                    <div
                      key={log.log_id}
                      className="rounded-2xl border px-3 py-2.5"
                      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ background: "rgba(79,142,247,.14)", color: transactionColor(log.transaction_type) }}
                        >
                          {transactionLabel(log.transaction_type)}
                        </span>
                        <span
                          className="font-mono text-[13px] font-bold"
                          style={{ color: transactionColor(log.transaction_type) }}
                        >
                          {log.quantity_change >= 0 ? "+" : ""}
                          {formatNumber(log.quantity_change)}
                        </span>
                      </div>
                      <div className="text-[13px] font-semibold">{log.item_name}</div>
                      <div className="mt-0.5 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                        {log.item_code} · {new Date(log.created_at).toLocaleString("ko-KR")}
                      </div>
                      {log.produced_by ? (
                        <div className="mt-1 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                          담당: {log.produced_by}
                        </div>
                      ) : null}

                      {/* Inline notes edit */}
                      {isEditing ? (
                        <div className="mt-2 flex items-center gap-1.5">
                          <input
                            autoFocus
                            value={editingNotes}
                            onChange={(e) => setEditingNotes(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveNotes(log.log_id);
                              if (e.key === "Escape") setEditingLogId(null);
                            }}
                            className="min-w-0 flex-1 rounded-lg border px-2 py-1 text-[12px] outline-none"
                            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.blue, color: LEGACY_COLORS.text }}
                            placeholder="비고 입력 (Enter 저장, Esc 취소)"
                          />
                          <button
                            onClick={() => void saveNotes(log.log_id)}
                            className="shrink-0 rounded-lg p-1"
                            style={{ background: LEGACY_COLORS.blue }}
                          >
                            <Check className="h-3 w-3 text-white" />
                          </button>
                          <button
                            onClick={() => setEditingLogId(null)}
                            className="shrink-0 rounded-lg p-1"
                            style={{ background: LEGACY_COLORS.s1 }}
                          >
                            <X className="h-3 w-3" style={{ color: LEGACY_COLORS.muted2 }} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingLogId(log.log_id); setEditingNotes(log.notes ?? ""); }}
                          className="group mt-1.5 flex w-full items-center gap-1 rounded-lg px-2 py-1 text-left text-[12px] transition"
                          style={{ background: "rgba(255,255,255,.03)" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(79,142,247,.08)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.03)"; }}
                        >
                          <Pencil className="h-2.5 w-2.5 shrink-0 opacity-40 group-hover:opacity-80" style={{ color: LEGACY_COLORS.blue }} />
                          <span style={{ color: log.notes ? LEGACY_COLORS.text : LEGACY_COLORS.muted2 }}>
                            {log.notes ?? "비고 추가…"}
                          </span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
