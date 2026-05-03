"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ElementType } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BarChart2, Boxes, History, Settings2, Warehouse } from "lucide-react";
import { DesktopSidebar, type DesktopTabId } from "./DesktopSidebar";
import { DesktopTopbar } from "./DesktopTopbar";
import { DesktopInventoryView } from "./DesktopInventoryView";
import { DesktopWarehouseView } from "./DesktopWarehouseView";
import { DesktopAdminView } from "./DesktopAdminView";
import { DesktopHistoryView } from "./DesktopHistoryView";
import { DesktopWeeklyReportView } from "./DesktopWeeklyReportView";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { api, type ProductionCapacity } from "@/lib/api";
import type { Item } from "@/lib/api";
import { CapacityDetailModal } from "./CapacityDetailModal";

const VALID_TABS = new Set<DesktopTabId>(["dashboard", "warehouse", "history", "weekly", "admin"]);
const DEFAULT_STATUS = "DEXCOWIN MES System";

const TAB_META: Record<DesktopTabId, { title: string; icon: ElementType }> = {
  dashboard: { title: "대시보드", icon: Boxes },
  warehouse: { title: "입출고", icon: Warehouse },
  history: { title: "입출고 내역", icon: History },
  weekly: { title: "주간보고", icon: BarChart2 },
  admin: { title: "관리자", icon: Settings2 },
};

export function DesktopLegacyShell() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialTab = (() => {
    const t = searchParams.get("tab") as DesktopTabId | null;
    return t && VALID_TABS.has(t) ? t : "dashboard";
  })();

  const [activeTab, setActiveTab] = useState<DesktopTabId>(initialTab);
  const [status, setStatus] = useState(DEFAULT_STATUS);
  const [statusNonce, setStatusNonce] = useState(0);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const autoRevertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleStatusChange = useCallback((msg: string) => {
    if (autoRevertTimerRef.current) clearTimeout(autoRevertTimerRef.current);
    setStatus(msg);
    setStatusNonce((n) => n + 1);
    if (msg === DEFAULT_STATUS) return;
    const isSticky = /실패|못했습니다|오류|에러|부족|품절/.test(msg);
    if (!isSticky) {
      autoRevertTimerRef.current = setTimeout(() => {
        setStatus(DEFAULT_STATUS);
        setStatusNonce((n) => n + 1);
      }, 3000);
    }
  }, []);

  function handleTabChange(tab: DesktopTabId) {
    if (tab === activeTab) return;
    setActiveTab(tab);
    router.push(`?tab=${tab}`, { scroll: false });
  }

  // 브라우저 뒤로/앞으로 → URL ?tab= 변경 시 activeTab 동기화
  useEffect(() => {
    const t = searchParams.get("tab") as DesktopTabId | null;
    if (t && VALID_TABS.has(t) && t !== activeTab) {
      setActiveTab(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const [warehousePreselected, setWarehousePreselected] = useState<Item | null>(null);
  const [capacityData, setCapacityData] = useState<ProductionCapacity | null>(null);
  const [capacityModal, setCapacityModal] = useState(false);
  const [stockWarnings, setStockWarnings] = useState<{ low: number; zero: number } | null>(null);

  const loadCapacity = useCallback(() => {
    void api.getProductionCapacity().then(setCapacityData).catch(() => {});
  }, []);

  useEffect(() => {
    loadCapacity();
  }, [loadCapacity]);

  // window focus 시 조용한 재조회
  useEffect(() => {
    function handleFocus() {
      setRefreshNonce((n) => n + 1);
      loadCapacity();
    }
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [loadCapacity]);

  const activeMeta = TAB_META[activeTab];

  const handleGoToWarehouse = useCallback((item: Item) => {
    setWarehousePreselected(item);
    setActiveTab("warehouse");
  }, []);

  const content = useMemo(() => {
    const key = activeTab === "admin" ? "admin" : `${activeTab}-${refreshNonce}`;
    if (activeTab === "dashboard") {
      return (
        <DesktopInventoryView
          key={key}
          globalSearch=""
          onStatusChange={handleStatusChange}
          onGoToWarehouse={handleGoToWarehouse}
          onGoToWarehouseTab={() => handleTabChange("warehouse")}
          onSummaryChange={setStockWarnings}
          capacityData={capacityData}
          onCapacityClick={() => setCapacityModal(true)}
        />
      );
    }
    if (activeTab === "warehouse") {
      return (
        <DesktopWarehouseView
          key={key}
          globalSearch=""
          onStatusChange={handleStatusChange}
          preselectedItem={warehousePreselected}
          onSubmitSuccess={loadCapacity}
        />
      );
    }
    if (activeTab === "history") {
      return <DesktopHistoryView key={key} />;
    }
    if (activeTab === "weekly") {
      return <DesktopWeeklyReportView key={key} />;
    }
    return <DesktopAdminView key={key} globalSearch="" onStatusChange={handleStatusChange} />;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, refreshNonce, warehousePreselected, handleGoToWarehouse, capacityData, loadCapacity]);

  return (
    <>
      {capacityModal && (
        <CapacityDetailModal
          capacityData={capacityData}
          onClose={() => setCapacityModal(false)}
        />
      )}
      <div className="hidden h-screen overflow-hidden lg:flex">
      <div className="flex h-full w-full gap-3 px-3 py-3" style={{ background: LEGACY_COLORS.bg, color: LEGACY_COLORS.text }}>
        <DesktopSidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          alertCount={{ dashboard: stockWarnings ? stockWarnings.zero + stockWarnings.low : 0 }}
        />

        <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
          <DesktopTopbar
            title={activeMeta.title}
            icon={activeMeta.icon}
            onRefresh={() => {
              setRefreshNonce((current) => current + 1);
              loadCapacity();
            }}
            status={status}
            statusNonce={statusNonce}
          />

          <div className="mt-1 min-h-0 flex-1 overflow-hidden flex">{content}</div>
        </div>
      </div>
    </div>
    </>
  );
}
