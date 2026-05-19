"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart2,
  Bell,
  Boxes,
  History as HistoryIcon,
  Settings2,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { AlertsSheet } from "./AlertsSheet";
import { IconButton } from "./primitives";
import { DesktopInventoryView } from "../DesktopInventoryView";
import { DesktopWarehouseView } from "../DesktopWarehouseView";
import { DesktopHistoryView } from "../DesktopHistoryView";
import { DesktopWeeklyReportView } from "../DesktopWeeklyReportView";
import { DesktopAdminView } from "../DesktopAdminView";
import { WeeklyWeekPicker, getWeekStartMonday } from "../_weekly_sections/WeeklyWeekPicker";
import { api, type ProductionCapacity } from "@/lib/api";
import type { Item } from "@/lib/api";
import { CapacityDetailModal } from "../CapacityDetailModal";
import { useCurrentOperator } from "../login/useCurrentOperator";
import { canEnterIO } from "../_warehouse_steps";

export type MobileTabId = "dashboard" | "warehouse" | "history" | "weekly" | "admin";

const TAB_META: Record<MobileTabId, { label: string; icon: LucideIcon }> = {
  dashboard: { label: "대시보드", icon: Boxes },
  warehouse: { label: "입출고", icon: Warehouse },
  history: { label: "내역", icon: HistoryIcon },
  weekly: { label: "주간보고", icon: BarChart2 },
  admin: { label: "관리", icon: Settings2 },
};

const DEFAULT_STATUS = "DEXCOWIN MES System";

export function MobileShell() {
  const operator = useCurrentOperator();
  const [activeTab, setActiveTab] = useState<MobileTabId>("dashboard");
  const [status, setStatus] = useState(DEFAULT_STATUS);
  const [statusNonce, setStatusNonce] = useState(0);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const autoRevertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [weekMon, setWeekMon] = useState<Date>(() => getWeekStartMonday(new Date()));
  const [warehousePreselected, setWarehousePreselected] = useState<Item | null>(null);
  const [capacityData, setCapacityData] = useState<ProductionCapacity | null>(null);
  const [capacityModal, setCapacityModal] = useState(false);
  const [stockWarnings, setStockWarnings] = useState<{ low: number; zero: number } | null>(null);

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

  const handleTabChange = useCallback((tab: MobileTabId) => {
    if (tab === activeTab) {
      if (tab !== "admin") {
        setRefreshNonce((n) => n + 1);
      }
      return;
    }
    setActiveTab(tab);
  }, [activeTab]);

  const handleGoToWarehouse = useCallback((item: Item) => {
    setWarehousePreselected(item);
    setActiveTab("warehouse");
  }, []);

  const loadCapacity = useCallback(() => {
    void api.getProductionCapacity().then(setCapacityData).catch(() => {});
  }, []);

  useEffect(() => {
    loadCapacity();
  }, [loadCapacity]);

  useEffect(() => {
    function handleFocus() {
      loadCapacity();
    }
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [loadCapacity]);

  const visibleTabs = useMemo(() => {
    const allTabs: MobileTabId[] = ["dashboard", "warehouse", "history", "weekly", "admin"];
    if (!operator) return allTabs;
    return allTabs.filter((tab) => {
      if (tab === "warehouse") return canEnterIO(operator);
      return true;
    });
  }, [operator]);

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
      return <DesktopWeeklyReportView key={key} weekMon={weekMon} />;
    }
    return <DesktopAdminView key={key} globalSearch="" onStatusChange={handleStatusChange} />;
  }, [
    activeTab,
    refreshNonce,
    warehousePreselected,
    handleGoToWarehouse,
    handleStatusChange,
    capacityData,
    weekMon,
    handleTabChange,
    loadCapacity,
  ]);

  return (
    <div className="h-screen overflow-hidden sm:bg-black">
      <div
        className="flex h-full flex-col overflow-hidden"
        style={{
          background: LEGACY_COLORS.bg,
          color: LEGACY_COLORS.text,
        }}
      >
        <div
          className="shrink-0"
          style={{
            height: "env(safe-area-inset-top, 18px)",
            background: LEGACY_COLORS.s1 as string,
          }}
        />

        <header
          className="relative flex shrink-0 items-center justify-between px-4 py-2"
          style={{
            background: LEGACY_COLORS.s1,
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          }}
        >
          <div className="min-w-0 flex-1">
            <div
              className="text-xs font-bold uppercase tracking-wider"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              {status}
            </div>
          </div>
          {activeTab === "weekly" && (
            <div className="flex items-center gap-2 shrink-0">
              <WeeklyWeekPicker weekMon={weekMon} onChange={setWeekMon} />
            </div>
          )}
          <div className="flex shrink-0 items-center gap-1 ml-2">
            <IconButton icon={Bell} label="알림" size="md" onClick={() => setAlertsOpen(true)} />
          </div>
        </header>

        <main className="relative flex-1 overflow-hidden flex">{content}</main>

        <nav
          className="shrink-0"
          style={{
            background: LEGACY_COLORS.s1,
            boxShadow: "0 -2px 8px rgba(0,0,0,0.12)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 10px))",
          }}
        >
          <div className="flex px-2 pt-2">
            {visibleTabs.map((tab) => {
              const active = tab === activeTab;
              const meta = TAB_META[tab];
              const Icon = meta.icon;
              return (
                <button
                  key={tab}
                  onClick={() => handleTabChange(tab)}
                  className="flex flex-1 flex-col items-center gap-1 py-1 transition-[transform] active:scale-[0.92]"
                  aria-label={meta.label}
                  aria-current={active ? "page" : undefined}
                >
                  <span
                    className="relative inline-flex h-9 w-12 items-center justify-center rounded-full transition-colors"
                    style={{
                      background: active ? `${LEGACY_COLORS.blue as string}1f` : "transparent",
                    }}
                  >
                    <Icon
                      size={20}
                      strokeWidth={active ? 2.25 : 1.75}
                      color={active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted}
                    />
                  </span>
                  <div
                    className="text-[10px] font-semibold"
                    style={{
                      color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted,
                    }}
                  >
                    {meta.label}
                  </div>
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {capacityModal && (
        <CapacityDetailModal
          capacityData={capacityData}
          onClose={() => setCapacityModal(false)}
        />
      )}
      <AlertsSheet open={alertsOpen} onClose={() => setAlertsOpen(false)} />
    </div>
  );
}
