"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart2,
  Boxes,
  History as HistoryIcon,
  Settings2,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import {
  MobileDashboardScreen,
  MobileWarehouseScreen,
  MobileDefectScreen,
  MobileHistoryScreen,
  MobileWeeklyScreen,
  MobileAdminScreen,
} from "./screens";
import { WeeklyWeekPicker, getWeekStartMonday } from "../_weekly_sections/WeeklyWeekPicker";
import { api, type ProductionCapacity } from "@/lib/api";
import type { Item } from "@/lib/api";
import { CapacityDetailModal } from "../CapacityDetailModal";
import { useCurrentOperator } from "../login/useCurrentOperator";
import { canEnterIO } from "../_warehouse_steps";
import { MobileUserMenuSheet } from "./MobileUserMenuSheet";

export type MobileTabId = "dashboard" | "warehouse" | "defect" | "history" | "weekly" | "admin";

const TAB_META: Record<MobileTabId, { label: string; icon: LucideIcon }> = {
  dashboard: { label: "대시보드", icon: Boxes },
  warehouse: { label: "입출고", icon: Warehouse },
  defect: { label: "불량", icon: AlertTriangle },
  history: { label: "내역", icon: HistoryIcon },
  weekly: { label: "주간보고", icon: BarChart2 },
  admin: { label: "관리", icon: Settings2 },
};

let _toastSeq = 0;

interface ToastItem {
  id: number;
  msg: string;
  type: "success" | "error" | "info";
}

export function MobileShell() {
  const operator = useCurrentOperator();
  const [activeTab, setActiveTab] = useState<MobileTabId>("dashboard");
  const [toastQueue, setToastQueue] = useState<ToastItem[]>([]);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [defectDeptFilter, setDefectDeptFilter] = useState<string | null>(null);

  // URL ?tab= / ?defect_dept= 으로 초기 상태 동기화.
  // useSearchParams 의 Suspense 요구를 피하려 클라이언트 마운트 시 1회만 읽는다.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    const valid: MobileTabId[] = ["dashboard", "warehouse", "defect", "history", "weekly", "admin"];
    if (t && (valid as string[]).includes(t)) setActiveTab(t as MobileTabId);
    const d = params.get("defect_dept");
    if (d) setDefectDeptFilter(d);
  }, []);

  const [weekMon, setWeekMon] = useState<Date>(() => getWeekStartMonday(new Date()));
  const [warehousePreselected, setWarehousePreselected] = useState<Item | null>(null);
  const [capacityData, setCapacityData] = useState<ProductionCapacity | null>(null);
  const [capacityModal, setCapacityModal] = useState(false);
  const [stockWarnings, setStockWarnings] = useState<{ low: number; zero: number } | null>(null);

  const handleStatusChange = useCallback((msg: string) => {
    const isError = /실패|못했습니다|오류|에러|부족|품절/.test(msg);
    const type: ToastItem["type"] = isError ? "error" : "info";
    setToastQueue((q: ToastItem[]) => {
      const next = [...q, { id: ++_toastSeq, msg, type }];
      return next.slice(-5); // 최대 5건 유지
    });
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToastQueue((q: ToastItem[]) => q.filter((t: ToastItem) => t.id !== id));
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
    const allTabs: MobileTabId[] = ["dashboard", "warehouse", "defect", "history", "weekly", "admin"];
    if (!operator) return allTabs;
    return allTabs.filter((tab) => {
      if (tab === "warehouse" || tab === "defect") return canEnterIO(operator);
      return true;
    });
  }, [operator]);

  const content = useMemo(() => {
    const key = activeTab === "admin" ? "admin" : `${activeTab}-${refreshNonce}`;
    if (activeTab === "dashboard") {
      return (
        <MobileDashboardScreen
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
        <MobileWarehouseScreen
          key={key}
          globalSearch=""
          onStatusChange={handleStatusChange}
          preselectedItem={warehousePreselected}
          onSubmitSuccess={loadCapacity}
        />
      );
    }
    if (activeTab === "defect") {
      return <MobileDefectScreen key={key} defectDeptFilter={defectDeptFilter} />;
    }
    if (activeTab === "history") {
      return <MobileHistoryScreen key={key} />;
    }
    if (activeTab === "weekly") {
      return <MobileWeeklyScreen key={key} weekMon={weekMon} />;
    }
    return <MobileAdminScreen key={key} globalSearch="" onStatusChange={handleStatusChange} />;
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
    defectDeptFilter,
  ]);

  return (
    <div className="h-[100dvh] overflow-hidden sm:bg-black" data-testid="mobile-shell">
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
              className="truncate text-xs font-bold uppercase tracking-wider"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              DEXCOWIN MES
            </div>
          </div>
          {activeTab === "weekly" && (
            <div className="flex items-center gap-2 shrink-0">
              <WeeklyWeekPicker weekMon={weekMon} onChange={setWeekMon} />
            </div>
          )}
          {operator && (
            <button
              type="button"
              onClick={() => setUserMenuOpen(true)}
              aria-label="사용자 메뉴"
              className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black transition-opacity active:opacity-70"
              style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text }}
            >
              {operator.name[0] ?? "?"}
            </button>
          )}
        </header>

        <main className="relative flex-1 overflow-hidden flex" data-testid="screen-root">
          <h1 className="sr-only">{TAB_META[activeTab].label} — DEXCOWIN MES</h1>
          {content}
        </main>

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
                  className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 py-1 transition-[transform] active:scale-[0.92]"
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
                      color={active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2}
                    />
                  </span>
                  <div
                    className="text-xs"
                    style={{
                      // WCAG AA: active blue(#2f74e7) 는 흰 배경서 4.14:1 로 미달 →
                      // 활성은 진한 text 색 + bold, 비활성은 muted2(5.55:1) 로 대비 확보.
                      color: active ? LEGACY_COLORS.text : LEGACY_COLORS.muted2,
                      fontWeight: active ? 800 : 600,
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

      {/* 토스트 큐 — 닫기 버튼, 자동 소멸 없음 (청각 장애/느린 네트워크 대응) */}
      {toastQueue.length > 0 && (
        <div
          className="pointer-events-none fixed left-0 right-0 z-[300] flex flex-col gap-2 px-4"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 10px) + 72px)" }}
        >
          {toastQueue.map((t: ToastItem) => {
            const borderColor =
              t.type === "error" ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
            return (
              <div
                key={t.id}
                role={t.type === "error" ? "alert" : "status"}
                aria-live={t.type === "error" ? "assertive" : "polite"}
                aria-atomic="true"
                className="pointer-events-auto flex items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold"
                style={{
                  background: LEGACY_COLORS.s3,
                  borderColor: LEGACY_COLORS.border,
                  borderLeftWidth: 3,
                  borderLeftColor: borderColor,
                  color: LEGACY_COLORS.text,
                }}
              >
                <span className="min-w-0 flex-1">{t.msg}</span>
                <button
                  type="button"
                  aria-label="메시지 닫기"
                  onClick={() => dismissToast(t.id)}
                  className="ml-1 shrink-0 rounded-full p-0.5 transition-opacity active:opacity-60"
                  style={{ color: LEGACY_COLORS.muted2 }}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      <MobileUserMenuSheet
        open={userMenuOpen}
        onClose={() => setUserMenuOpen(false)}
      />
    </div>
  );
}
