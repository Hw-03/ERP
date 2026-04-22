"use client";

import { useCallback, useMemo, useState } from "react";
import type { ElementType } from "react";
import { Boxes, History, Settings2, Warehouse } from "lucide-react";
import { DesktopSidebar, type DesktopTabId } from "./DesktopSidebar";
import { DesktopTopbar } from "./DesktopTopbar";
import { DesktopInventoryView } from "./DesktopInventoryView";
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

export function DesktopLegacyShell() {
  const [activeTab, setActiveTab] = useState<DesktopTabId>("inventory");
  const [status, setStatus] = useState("데스크톱 ERP 화면을 준비했습니다.");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [warehousePreselected, setWarehousePreselected] = useState<Item | null>(null);

  const activeMeta = TAB_META[activeTab];

  const handleGoToWarehouse = useCallback((item: Item) => {
    setWarehousePreselected(item);
    setActiveTab("warehouse");
  }, []);

  const content = useMemo(() => {
    const key = `${activeTab}-${refreshNonce}`;
    if (activeTab === "inventory") {
      return <DesktopInventoryView key={key} globalSearch="" onStatusChange={setStatus} onGoToWarehouse={handleGoToWarehouse} />;
    }
    if (activeTab === "warehouse") {
      return <DesktopWarehouseView key={key} globalSearch="" onStatusChange={setStatus} preselectedItem={warehousePreselected} />;
    }
    if (activeTab === "history") {
      return <DesktopHistoryView key={key} />;
    }
    return <DesktopAdminView key={key} globalSearch="" onStatusChange={setStatus} />;
  }, [activeTab, refreshNonce, warehousePreselected, handleGoToWarehouse]);

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
          />

          <div className="mt-1 min-h-0 flex-1 overflow-hidden flex">{content}</div>
        </div>
      </div>
    </div>
  );
}
