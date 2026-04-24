"use client";

import { useCallback, useMemo, useState } from "react";
import type { ElementType } from "react";
import { Boxes, History, Settings2, Warehouse } from "lucide-react";
import { DesktopSidebar, type DesktopTabId } from "./DesktopSidebar";
import { DesktopTopbar, type TopbarStatusSlot } from "./DesktopTopbar";
import { DesktopInventoryView, type InventorySummary } from "./DesktopInventoryView";
import { DesktopWarehouseView } from "./DesktopWarehouseView";
import { DesktopAdminView } from "./DesktopAdminView";
import { DesktopHistoryView } from "./DesktopHistoryView";
import { LEGACY_COLORS } from "./legacyUi";
import type { Item } from "@/lib/api";

const TAB_META: Record<DesktopTabId, { title: string; icon: ElementType }> = {
  inventory: { title: "대시보드", icon: Boxes },
  warehouse: { title: "입출고", icon: Warehouse },
  history: { title: "입출고 내역", icon: History },
  admin: { title: "관리자", icon: Settings2 },
};

function formatTimeHM(ts: number | null): string {
  if (ts == null) return "-";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function DesktopLegacyShell() {
  const [activeTab, setActiveTab] = useState<DesktopTabId>("inventory");
  const [status, setStatus] = useState("데스크톱 ERP 화면을 준비했습니다.");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [warehousePreselected, setWarehousePreselected] = useState<Item | null>(null);
  const [inventorySummary, setInventorySummary] = useState<InventorySummary | null>(null);

  const activeMeta = TAB_META[activeTab];

  const handleGoToWarehouse = useCallback((item: Item) => {
    setWarehousePreselected(item);
    setActiveTab("warehouse");
  }, []);

  const content = useMemo(() => {
    const key = `${activeTab}-${refreshNonce}`;
    if (activeTab === "inventory") {
      return (
        <DesktopInventoryView
          key={key}
          globalSearch=""
          onStatusChange={setStatus}
          onSummaryChange={setInventorySummary}
          onGoToWarehouse={handleGoToWarehouse}
        />
      );
    }
    if (activeTab === "warehouse") {
      return (
        <DesktopWarehouseView
          key={key}
          globalSearch=""
          onStatusChange={setStatus}
          preselectedItem={warehousePreselected}
        />
      );
    }
    if (activeTab === "history") {
      return <DesktopHistoryView key={key} />;
    }
    return <DesktopAdminView key={key} globalSearch="" onStatusChange={setStatus} />;
  }, [activeTab, refreshNonce, warehousePreselected, handleGoToWarehouse]);

  const topbarStatusSlots: TopbarStatusSlot[] | undefined = useMemo(() => {
    if (activeTab !== "inventory" || !inventorySummary) return undefined;
    const { total, low, zero, lastUpdatedAt } = inventorySummary;
    return [
      { label: "전체", value: `${total.toLocaleString("ko-KR")}건` },
      {
        label: "품절",
        value: zero,
        tone: zero > 0 ? LEGACY_COLORS.red : LEGACY_COLORS.muted2,
      },
      {
        label: "부족",
        value: low,
        tone: low > 0 ? LEGACY_COLORS.yellow : LEGACY_COLORS.muted2,
      },
      { label: "갱신", value: formatTimeHM(lastUpdatedAt) },
    ];
  }, [activeTab, inventorySummary]);

  return (
    <div className="hidden h-screen overflow-hidden lg:flex">
      <div className="flex h-full w-full gap-3 px-3 py-3" style={{ background: LEGACY_COLORS.bg, color: LEGACY_COLORS.text }}>
        <DesktopSidebar activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
          <DesktopTopbar
            title={activeMeta.title}
            icon={activeMeta.icon}
            onRefresh={() => setRefreshNonce((current) => current + 1)}
            statusText={status}
            statusSlots={topbarStatusSlots}
          />

          <div className="mt-1 min-h-0 flex-1 overflow-hidden flex">{content}</div>
        </div>
      </div>
    </div>
  );
}
