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
import {
  WeeklyWeekPicker,
  getWeekStartMonday,
} from "./_weekly_sections/WeeklyWeekPicker";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { api, type ProductionCapacity } from "@/lib/api";
import type { Item } from "@/lib/api";
import { CapacityDetailModal } from "./CapacityDetailModal";
import { AdminDirtyProvider, useAdminDirty } from "./_admin_sections/AdminDirtyRegistry";

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
  return (
    <AdminDirtyProvider>
      <DesktopLegacyShellInner />
    </AdminDirtyProvider>
  );
}

function DesktopLegacyShellInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { confirmAdminNavigation } = useAdminDirty();

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
    if (tab === activeTab) {
      // admin 은 key 가 고정이라 리마운트되지 않음 — 의도적 제외 (내부 폼 입력 보호)
      if (tab !== "admin") {
        setRefreshNonce((n) => n + 1);
      }
      return;
    }
    // 트리거 (c) — 메인 탭 변경. activeTab === 'admin' 일 때만 가드 (다른 탭은 dirty 없음).
    const doSwitch = () => {
      setActiveTab(tab);
      router.push(`?tab=${tab}`, { scroll: false });
    };
    if (activeTab === "admin") {
      confirmAdminNavigation(doSwitch);
    } else {
      doSwitch();
    }
  }

  // 브라우저 뒤로/앞으로 → URL ?tab= 변경 시 activeTab 동기화.
  // defect_dept 쿼리도 함께 읽어 warehouse 탭 진입 시 필터로 전달.
  useEffect(() => {
    const t = searchParams.get("tab") as DesktopTabId | null;
    if (t && VALID_TABS.has(t) && t !== activeTab) {
      setActiveTab(t);
    }
    const dept = searchParams.get("defect_dept");
    setDefectDeptFilter(dept);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const [weekMon, setWeekMon] = useState<Date>(() => getWeekStartMonday(new Date()));

  const [warehousePreselected, setWarehousePreselected] = useState<Item | null>(null);
  const [defectDeptFilter, setDefectDeptFilter] = useState<string | null>(() => {
    // 초기 URL 에 defect_dept 쿼리가 있으면 읽어 둔다
    return searchParams.get("defect_dept");
  });
  const [capacityData, setCapacityData] = useState<ProductionCapacity | null>(null);
  const [capacityModal, setCapacityModal] = useState(false);
  const [stockWarnings, setStockWarnings] = useState<{ low: number; zero: number } | null>(null);

  const loadCapacity = useCallback(() => {
    void api.getProductionCapacity().then(setCapacityData).catch(() => {});
  }, []);

  useEffect(() => {
    loadCapacity();
  }, [loadCapacity]);

  // window focus 시 capacity 만 백그라운드 갱신 — 자식 컴포넌트는 리마운트하지 않음
  // (다른 창 갔다 돌아왔을 때 사용자 입력이 사라지는 문제 방지)
  useEffect(() => {
    function handleFocus() {
      loadCapacity();
    }
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [loadCapacity]);

  const activeMeta = TAB_META[activeTab];

  const handleGoToWarehouse = useCallback((item: Item) => {
    setWarehousePreselected(item);
    setActiveTab("warehouse");
    // URL 도 함께 갱신해야 입출고 위저드의 ?step=N push 가 dashboard 잔여 쿼리와 충돌하지 않는다.
    router.push("?tab=warehouse", { scroll: false });
  }, [router]);

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
          defectDeptFilter={defectDeptFilter}
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, refreshNonce, warehousePreselected, handleGoToWarehouse, capacityData, loadCapacity, weekMon, defectDeptFilter]);

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

        <div className="min-w-0 flex-1 flex flex-col">
          <DesktopTopbar
            title={activeMeta.title}
            icon={activeMeta.icon}
            onRefresh={() => {
              setRefreshNonce((current) => current + 1);
              loadCapacity();
            }}
            status={status}
            statusNonce={statusNonce}
            titleAddon={
              activeTab === "weekly" ? (
                <WeeklyWeekPicker weekMon={weekMon} onChange={setWeekMon} />
              ) : undefined
            }
          />

          <div className="mt-1 min-h-0 flex-1 overflow-hidden flex">{content}</div>
        </div>
      </div>
    </div>
    </>
  );
}
