"use client";

import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DesktopTabHomeProvider, useDesktopTabHome, useDesktopTabHomeController } from "./DesktopTabHome";
import { InventoryItemsTable } from "./_inventory_sections/InventoryItemsTable";
import { InventoryKpiPanel } from "./_inventory_sections/InventoryKpiPanel";
import { InventoryFilterToggleButton } from "./_inventory_sections/InventoryFilterToggleButton";
import { InventoryTableStickyHeader } from "./_inventory_sections/InventoryFilterBar";
import { HistoryTableSkeleton } from "./_history_sections/HistoryTable";
import { HistoryStatsBar } from "./_history_sections/HistoryStatsBar";
import { HistoryFilterBar } from "./_history_sections/HistoryFilterBar";
import type { ElementType, ReactNode, RefObject } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BarChart2, Boxes, ClipboardList, History, MapPinned, Settings, Settings2, Truck, Warehouse } from "lucide-react";
import { DESKTOP_TAB_ICON_COLORS, DesktopSidebar, type DesktopTabId } from "./DesktopSidebar";
import { DesktopTopbar } from "./DesktopTopbar";
import type { NotificationNavigationTarget } from "./notifications/NotificationBell";
import { DesktopInventoryView } from "./DesktopInventoryView";
import { DesktopWarehouseView } from "./DesktopWarehouseView";
import { DesktopShippingView } from "./DesktopShippingView";
import { defectEntryUrl, readDefectDepartment, type DefectEntryTarget } from "@/lib/defect-entry";
import { resumeWorkListShippingEntry, withoutWorkListReturn } from "@/lib/work-draft-navigation";
import { DesktopWarehouseMapTab } from "./DesktopWarehouseMapTab";
import { DesktopDefectView } from "./DesktopDefectView";
import { DesktopAdminView } from "./DesktopAdminView";
import { DesktopHistoryView } from "./DesktopHistoryView";
import { DesktopWeeklyReportView } from "./DesktopWeeklyReportView";
import { DesktopDailyWorkReportView } from "./DesktopDailyWorkReportView";
import { DesktopSettingsView } from "./AppearanceSettingsModal";
import { StocktakeView } from "./stocktake/StocktakeView";
import { useStocktakeMenuVisibility } from "./stocktake/useStocktakeMenuVisibility";
import { StocktakeLoadingSkeleton } from "./stocktake/StocktakeLoadingSkeleton";
import { useAppearancePreferences } from "./useAppearancePreferences";
import { useCurrentOperator } from "./login/useCurrentOperator";
import { AccessRevocationGuard } from "./common/AccessRevocationGuard";
import {
  WeeklyWeekPicker,
  getWeekStartMonday,
} from "./_weekly_sections/WeeklyWeekPicker";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatKstDate } from "@/lib/mes/date";
import { api } from "@/lib/api";
import type { Item, ProductionCapacity } from "@/lib/api";
import { productionApi } from "@/lib/api/production";
import { warehouseMapApi } from "@/lib/api/warehouse-map";
import { STALE_TIME } from "@/lib/queries/client";
import { queryKeys } from "@/lib/queries/keys";
import { useProductionCapacityQuery } from "@/lib/queries/useProductionQuery";
import { sendClientEvent } from "@/lib/client-events";
import { setAuditScreen } from "@/lib/activity-audit-context";
import { DirtyGuardProvider, useConfirmNavigation, useBeforeViewportSwitch, useFlushDirtyEntries } from "@/lib/ui/dirty-guard";
import { canSeeWorkType } from "./_warehouse_v2/ioWorkType";
import type { IoEntryIntent } from "./_warehouse_v2/types";
import { HISTORY_PAGE_SIZE } from "./_history_sections/historyConstants";
import { dateFilterToFrom } from "./_history_sections/historyQuery";
import {
  filterVisibleSidebarTabs,
  SIDEBAR_TAB_IDS,
} from "./tabAccess";

const VALID_TABS = new Set<DesktopTabId>([...SIDEBAR_TAB_IDS, "settings"]);
const DEFAULT_STATUS = "DEXCOWIN MES";
const MS_PER_DAY = 86400000;
type DashboardScrollGeometry = { height: number; width: number };

type DesktopTabNavigation = "push" | "replace" | "none";

const TAB_META: Record<DesktopTabId, { title: string; icon: ElementType }> = {
  dashboard: { title: "대시보드", icon: Boxes },
  warehouse: { title: "입출고", icon: Warehouse },
  shipping: { title: "출하", icon: Truck },
  warehouseMap: { title: "창고 지도", icon: MapPinned },
  defect: { title: "불량", icon: AlertTriangle },
  history: { title: "입출고 내역", icon: History },
  dailyReport: { title: "일일 작업 일보", icon: ClipboardList },
  weekly: { title: "주간보고", icon: BarChart2 },
  admin: { title: "관리자", icon: Settings2 },
  settings: { title: "설정", icon: Settings },
  stocktake: { title: "재고 전수조사", icon: ClipboardList },
};

export function DesktopMesShell({
  onBeforeViewportSwitchChange,
}: {
  onBeforeViewportSwitchChange?: (handler: (() => Promise<void | boolean>) | null) => void;
}) {
  return (
    <DirtyGuardProvider>
      <DesktopTabHomeProvider>
      <DesktopMesShellInner onBeforeViewportSwitchChange={onBeforeViewportSwitchChange} />
      </DesktopTabHomeProvider>
    </DirtyGuardProvider>
  );
}

function DesktopMesShellInner({
  onBeforeViewportSwitchChange,
}: {
  onBeforeViewportSwitchChange?: (handler: (() => Promise<void | boolean>) | null) => void;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirmAdminNavigation = useConfirmNavigation();
  const { requestHome, returnSequence } = useDesktopTabHomeController();
  const homeMotionRef = useRef<HTMLDivElement>(null);
  const dashboardScrollGeometry = useRef<DashboardScrollGeometry | null>(null);
  useLayoutEffect(() => {
    if (!returnSequence || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const body = homeMotionRef.current;
    const animation = body?.animate?.(
      [{ opacity: 0.7 }, { opacity: 1 }],
      { duration: 180, easing: "ease-out" },
    );
    return () => animation?.cancel();
  }, [returnSequence]);
  const beforeViewportSwitch = useBeforeViewportSwitch();
  const flushDirtyEntries = useFlushDirtyEntries();
  const operator = useCurrentOperator();
  const stocktakeMenuQuery = useStocktakeMenuVisibility(operator);
  const stocktakeMenu = stocktakeMenuQuery.data;
  const { preferences, savePreferences } = useAppearancePreferences();
  const visibleTabs = useMemo<DesktopTabId[]>(
    () => filterVisibleSidebarTabs(SIDEBAR_TAB_IDS, operator, stocktakeMenu),
    [operator, stocktakeMenu],
  );
  const fallbackTab: DesktopTabId = visibleTabs[0] ?? "settings";
  const canOpenTab = useCallback(
    (tab: DesktopTabId) => tab === "settings" || visibleTabs.includes(tab),
    [visibleTabs],
  );

  const initialTab = (() => {
    const params = typeof window === "undefined"
      ? searchParams
      : new URLSearchParams(window.location.search);
    const t = params.get("tab") as DesktopTabId | null;
    return t && VALID_TABS.has(t) ? t : "dashboard";
  })();

  const [activeTab, setActiveTab] = useState<DesktopTabId>(initialTab);
  const deferredTab = useDeferredValue(activeTab);
  const contentTab = activeTab === "dashboard" || activeTab === "history" ? deferredTab : activeTab;
  const admittedStocktakeEmployee = useRef<string | null>(null);
  const canOpenStocktake = canOpenTab("stocktake");
  // The operator hook restores after mount, including a mobile-to-desktop switch.
  const stocktakeAccessPending = !operator || (stocktakeMenuQuery.isLoading && !canOpenStocktake);
  const retainStocktake = contentTab === "stocktake" && !!operator && admittedStocktakeEmployee.current === operator.employee_id;
  useLayoutEffect(() => {
    if (contentTab !== "stocktake") admittedStocktakeEmployee.current = null;
    else if (canOpenStocktake && operator) admittedStocktakeEmployee.current = operator.employee_id;
  }, [contentTab, canOpenStocktake, operator]);
  const [status, setStatus] = useState(DEFAULT_STATUS);
  const [statusNonce, setStatusNonce] = useState(0);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [adminPinEntryNonce, setAdminPinEntryNonce] = useState(0);
  const [warehouseMapFullscreen, setWarehouseMapFullscreen] = useState(false);
  const [itemPickerFullscreen, setItemPickerFullscreen] = useState(false);
  const [defectItemPickerFullscreen, setDefectItemPickerFullscreen] = useState(false);
  const [dailyReportTopbarControls, setDailyReportTopbarControls] = useState<ReactNode>(null);
  const [costHeaderTarget, setCostHeaderTarget] = useState<HTMLDivElement | null>(null);
  const autoRevertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUrlTabRef = useRef<DesktopTabId | null>(null);
  const shippingHistoryUrlRef = useRef("?tab=shipping");
  const pendingShippingHistoryTabRef = useRef<DesktopTabId | null>(null);

  useEffect(() => {
    const meta = TAB_META[activeTab];
    setAuditScreen({ key: `desktop.${activeTab}`, label: meta.title });
  }, [activeTab]);

  useEffect(() => {
    onBeforeViewportSwitchChange?.(beforeViewportSwitch);
    return () => onBeforeViewportSwitchChange?.(null);
  }, [beforeViewportSwitch, onBeforeViewportSwitchChange]);

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

  const commitDesktopTab = useCallback((
    tab: DesktopTabId,
    options?: {
      navigation?: DesktopTabNavigation;
      url?: string;
      closeWarehouseMapFullscreen?: boolean;
    },
  ) => {
    const navigation = options?.navigation ?? "push";
    const url = options?.url ?? `?tab=${tab}`;
    const closeWarehouseMapFullscreen = options?.closeWarehouseMapFullscreen ?? true;
    const updateTabState = () => {
      if (closeWarehouseMapFullscreen) setWarehouseMapFullscreen(false);
      if (activeTab !== tab) {
        sendClientEvent({
          event: "ui_nav",
          from: activeTab,
          to: tab,
          path: "/mes",
          screen_key: `desktop.${tab}`,
          screen_label: TAB_META[tab].title,
          source: "desktop",
        });
      }
      setActiveTab(tab);
    };

    if (navigation !== "none") pendingUrlTabRef.current = tab;
    updateTabState();

    if (navigation === "push") window.history.pushState(null, "", url);
    if (navigation === "replace") window.history.replaceState(null, "", url);
  }, [activeTab]);

  function handleTabChange(tab: DesktopTabId) {
    if (!canOpenTab(tab)) {
      if (fallbackTab !== activeTab) {
        confirmAdminNavigation(() => commitDesktopTab(fallbackTab));
      }
      return;
    }
    if (tab === activeTab) {
      if (activeTab !== contentTab) return;
      requestHome(() => {
        if (tab === "shipping") return; // Its owner synchronizes the guarded URL transition.
        const url = new URL(window.location.href);
        const state = withoutWorkListReturn(window.history.state);
        if (tab === "warehouse") {
          for (const name of ["section", "step", "draftId", "stockRequestId"]) url.searchParams.delete(name);
          delete state.wic;
        }
        if (tab === "defect") state.defect = "hub";
        if (tab === "warehouseMap") { delete state.wm; state.wmDepth = 0; }
        window.history.pushState(state, "", url);
      });
      return;
    }
    // 트리거 (c) — 메인 탭 변경. dirty 등록된 섹션(admin / warehouse-io)이 있으면
    // 가드. 없으면 즉시 이동. confirmAdminNavigation 은 useConfirmNavigation 의
    // 결과로, 등록된 모든 dirty entry 를 자동 집계한다.
    const doSwitch = () => {
      commitDesktopTab(tab);
    };
    confirmAdminNavigation(doSwitch);
  }

  const handleOpenAdminPinEntry = useCallback(() => {
    if (!canOpenTab("admin")) return;
    confirmAdminNavigation(() => {
      setAdminPinEntryNonce((current) => current + 1);
      commitDesktopTab("admin");
    });
  }, [canOpenTab, commitDesktopTab, confirmAdminNavigation]);

  const handleDailyReportTopbarControlsChange = useCallback((controls: ReactNode | null) => {
    setDailyReportTopbarControls(controls);
  }, []);

  // 알림 클릭 딥링크 — 해당 탭(+섹션)으로 이동. section 은 입출고 섹션(queue/dept-queue/mine).
  function handleNotificationNavigate({ tab, section, relatedRequestId }: NotificationNavigationTarget) {
    if (!VALID_TABS.has(tab as DesktopTabId) || !canOpenTab(tab as DesktopTabId)) return;
    const target = tab as DesktopTabId;
    confirmAdminNavigation(() => {
      const params = new URLSearchParams({ tab: target });
      if (section) params.set("section", section);
      if (target === "warehouse" && relatedRequestId) params.set("stockRequestId", relatedRequestId);
      const url = `?${params.toString()}`;
      if (target === activeTab) {
        // 같은 탭이면 리마운트를 강제해 섹션 초기화 로직(?section=)이 다시 실행되게 한다.
        pendingUrlTabRef.current = target;
        router.push(url, { scroll: false });
        setRefreshNonce((n) => n + 1);
      } else {
        commitDesktopTab(target, { url });
      }
    });
  }

  // 브라우저 뒤로/앞으로 → URL ?tab= 변경 시 activeTab 동기화.
  // defect_dept 쿼리도 함께 읽어 불량 탭 진입 시 부서 필터로 전달.
  // ?defect_dept= 만 있고 ?tab= 이 없으면(레거시 링크 호환) 불량 탭으로 재라우팅.
  useEffect(() => {
    // A menu change must not unmount an admitted draft before its save/receipt guard completes.
    if (activeTab === "stocktake" && stocktakeAccessPending) return;
    if (operator && !canOpenTab(activeTab)) return;
    // A responsive remount can briefly see the previous shell's App Router snapshot.
    // The address-bar URL is authoritative for restoring the active desktop tab.
    const currentParams = new URLSearchParams(window.location.search);
    const t = currentParams.get("tab") as DesktopTabId | null;
    const dept = readDefectDepartment(window.location.search);
    const targetFromUrl = t && VALID_TABS.has(t) ? t : !t && dept ? "defect" : null;
    const pendingUrlTab = pendingUrlTabRef.current;

    if (pendingUrlTab) {
      if (targetFromUrl === pendingUrlTab) {
        pendingUrlTabRef.current = null;
      } else if (activeTab === pendingUrlTab) {
        setDefectDeptFilter(canOpenTab("defect") ? dept : null);
        return;
      }
    }

    if (targetFromUrl) {
      const target = canOpenTab(targetFromUrl) ? targetFromUrl : fallbackTab;
      if (target !== activeTab) {
        // URL-driven history changes must keep shipping editors mounted until their dirty guard settles.
        if (activeTab === "shipping") {
          if (pendingShippingHistoryTabRef.current === target) return;
          pendingShippingHistoryTabRef.current = target;
          confirmAdminNavigation(() => {
            pendingShippingHistoryTabRef.current = null;
            commitDesktopTab(target, { navigation: "none", closeWarehouseMapFullscreen: false });
            if (target !== targetFromUrl) router.replace(`?tab=${target}`, { scroll: false });
            setDefectDeptFilter(canOpenTab("defect") ? dept : null);
          }, () => {
            pendingShippingHistoryTabRef.current = null;
            pendingUrlTabRef.current = "shipping";
            if (!resumeWorkListShippingEntry(operator?.employee_id ?? "", shippingHistoryUrlRef.current)) {
              router.replace(shippingHistoryUrlRef.current, { scroll: false });
            }
          });
          return;
        }
        commitDesktopTab(target, { navigation: "none", closeWarehouseMapFullscreen: false });
      }
      if (target === "shipping") shippingHistoryUrlRef.current = window.location.search;
      if (target !== targetFromUrl) router.replace(`?tab=${target}`, { scroll: false });
    } else if (!canOpenTab(activeTab)) {
      commitDesktopTab(fallbackTab, { navigation: "replace" });
    }

    setDefectDeptFilter(canOpenTab("defect") ? dept : null);
  }, [searchParams, activeTab, canOpenTab, fallbackTab, router, commitDesktopTab, operator, stocktakeAccessPending, confirmAdminNavigation]);

  useEffect(() => {
    if (activeTab !== "warehouseMap" && warehouseMapFullscreen) {
      setWarehouseMapFullscreen(false);
    }
  }, [activeTab, warehouseMapFullscreen]);

  useEffect(() => {
    if (activeTab !== "warehouse" && itemPickerFullscreen) {
      setItemPickerFullscreen(false);
    }
  }, [activeTab, itemPickerFullscreen]);

  useEffect(() => {
    if (activeTab !== "defect" && defectItemPickerFullscreen) {
      setDefectItemPickerFullscreen(false);
    }
  }, [activeTab, defectItemPickerFullscreen]);

  useEffect(() => {
    if (activeTab !== "dailyReport") setDailyReportTopbarControls(null);
  }, [activeTab]);

  const [weekMon, setWeekMon] = useState<Date>(() => getWeekStartMonday(new Date()));

  useEffect(() => {
    const params = {
      limit: HISTORY_PAGE_SIZE,
      cursor: null,
      operationKeys: undefined,
      dateFrom: dateFilterToFrom("MONTH"),
      dateTo: undefined,
      search: undefined,
      department: undefined,
      model: undefined,
    };
    void queryClient.prefetchQuery({
      queryKey: queryKeys.transactions.displayGroups(params),
      queryFn: ({ signal }) => productionApi.getTransactionDisplayGroups(params, { signal }),
      staleTime: STALE_TIME.VOLATILE,
    });
    const summaryParams = { dateFrom: params.dateFrom, dateTo: undefined };
    void queryClient.prefetchQuery({
      queryKey: queryKeys.transactions.summary(summaryParams),
      queryFn: ({ signal }) => productionApi.getTransactionsSummary(summaryParams, { signal }),
      staleTime: STALE_TIME.VOLATILE,
    });
  }, [queryClient]);

  useEffect(() => {
    const weekStart = formatKstDate(weekMon);
    const weekEnd = formatKstDate(new Date(weekMon.getTime() + 6 * MS_PER_DAY));

    void queryClient.prefetchQuery({
      queryKey: queryKeys.weekly.report(weekStart, weekEnd),
      queryFn: () => api.getWeeklyReport({ week_start: weekStart, week_end: weekEnd }),
    });
    void queryClient.prefetchQuery({
      queryKey: queryKeys.warehouseMap.map(),
      queryFn: () => warehouseMapApi.getMap(),
    });
    void queryClient.prefetchQuery({
      queryKey: queryKeys.shipping.requests(),
      queryFn: ({ signal }) => api.getShippingRequests(undefined, { signal }),
    });
  }, [queryClient, weekMon]);

  const [warehousePreselected, setWarehousePreselected] = useState<Item | null>(null);
  const [warehouseIntent, setWarehouseIntent] = useState<IoEntryIntent | null>(null);
  const clearWarehouseEntry = useCallback(() => {
    setWarehousePreselected(null);
    setWarehouseIntent(null);
  }, []);
  useEffect(() => {
    if (activeTab !== "warehouse") clearWarehouseEntry();
  }, [activeTab, clearWarehouseEntry]);
  const [defectDeptFilter, setDefectDeptFilter] = useState<string | null>(() => {
    // 초기 URL 에 defect_dept 쿼리가 있으면 읽어 둔다
    return readDefectDepartment(searchParams.toString());
  });
  const {
    data: capacityData = null,
    isLoading: capacityLoading,
    refetch: refetchCapacity,
    error: capacityError,
  } = useProductionCapacityQuery();
  const [capacityRefreshKey, setCapacityRefreshKey] = useState(0);
  useDesktopTabHome("shell-overlays", {
    isHome: !(activeTab === "warehouse" && (warehousePreselected || warehouseIntent || itemPickerFullscreen)) && !(activeTab === "defect" && defectItemPickerFullscreen),
    returnHome: () => {
      clearWarehouseEntry();
      setItemPickerFullscreen(false);
      setDefectItemPickerFullscreen(false);
    },
  });
  const [stockWarnings, setStockWarnings] = useState<{ low: number; zero: number } | null>(null);

  const activeMeta = TAB_META[activeTab];
  const isItemPickerFullscreen = activeTab === "warehouse" && itemPickerFullscreen;
  const isDefectItemPickerFullscreen = activeTab === "defect" && defectItemPickerFullscreen;
  const hideTopbar = warehouseMapFullscreen || isItemPickerFullscreen || isDefectItemPickerFullscreen;

  const canOpenWarehouse = canOpenTab("warehouse");
  const canReceive = canSeeWorkType("receive", operator) && canOpenWarehouse;

  const handleGoToWarehouse = useCallback((item: Item, intent?: IoEntryIntent) => {
    if (!canOpenTab("warehouse")) return;
    setWarehousePreselected(item);
    setWarehouseIntent(intent ?? null);
    commitDesktopTab("warehouse");
    // tab 만 전환 — step 은 위저드(useIoUrlSync)가 tab=warehouse 와 함께 기록한다.
  }, [canOpenTab, commitDesktopTab]);

  const handleGoToDefect = useCallback((target: DefectEntryTarget): void => {
    if (!canOpenTab("defect")) return;
    confirmAdminNavigation(() => commitDesktopTab("defect", { url: defectEntryUrl(window.location.pathname, target) }));
  }, [canOpenTab, commitDesktopTab, confirmAdminNavigation]);

  const content = useMemo(() => {
    const key = contentTab === "dashboard" ? "dashboard" : contentTab === "admin" ? `admin-${adminPinEntryNonce}` : `${contentTab}-${refreshNonce}`;
    if (contentTab === "stocktake" && stocktakeAccessPending && !retainStocktake) return <StocktakeLoadingSkeleton variant="desktop" />;
    if (contentTab === "stocktake") return canOpenTab("stocktake") || retainStocktake ? <StocktakeView key={key} operator={operator} variant="desktop" /> : null;
    if (contentTab === "dashboard") {
      return (
        <DesktopInventoryView
          costHeaderTarget={costHeaderTarget}
          key={key}
          globalSearch=""
          onStatusChange={handleStatusChange}
          onGoToWarehouse={handleGoToWarehouse}
          onGoToDefect={handleGoToDefect}
          onGoToWarehouseTab={() => handleTabChange("warehouse")}
          onSummaryChange={setStockWarnings}
          capacityData={capacityData}
          capacityLoading={capacityLoading && !capacityData}
          capacityError={capacityError instanceof Error ? capacityError.message : null}
          onCapacityRetry={() => { void refetchCapacity(); }}
          capacityRefreshKey={capacityRefreshKey}
          canReceive={canReceive}
        />
      );
    }
    if (contentTab === "warehouse") {
      return (
        <DesktopWarehouseView
          key={key}
          globalSearch=""
          onStatusChange={handleStatusChange}
          preselectedItem={warehousePreselected}
          entryIntent={warehouseIntent}
          onSubmitSuccess={() => {
            clearWarehouseEntry();
            void refetchCapacity();
          }}
          itemPickerFullscreen={isItemPickerFullscreen}
          onItemPickerFullscreenChange={setItemPickerFullscreen}
        />
      );
    }
    if (contentTab === "shipping") {
      return (
        <DesktopShippingView
          key={key}
          operator={operator}
          onStatusChange={handleStatusChange}
          onGoToWarehouse={handleGoToWarehouse}
        />
      );
    }
    if (contentTab === "warehouseMap") {
      return (
        <DesktopWarehouseMapTab
          key={key}
          onStatusChange={handleStatusChange}
          fullscreen={warehouseMapFullscreen}
          onFullscreenChange={setWarehouseMapFullscreen}
        />
      );
    }
    if (contentTab === "defect") {
      return (
        <DesktopDefectView
          key={key}
          operator={operator}
          defectDeptFilter={defectDeptFilter}
          onStatusChange={handleStatusChange}
          itemPickerFullscreen={isDefectItemPickerFullscreen}
          onItemPickerFullscreenChange={setDefectItemPickerFullscreen}
        />
      );
    }
    if (contentTab === "history") {
      return <DesktopHistoryView key={key} />;
    }
    if (contentTab === "dailyReport") {
      return <DesktopDailyWorkReportView key={key} operator={operator} onTopbarControlsChange={handleDailyReportTopbarControlsChange} />;
    }
    if (contentTab === "weekly") {
      return <DesktopWeeklyReportView key={key} weekMon={weekMon} />;
    }
    if (contentTab === "settings") {
      return (
        <DesktopSettingsView
          key={key}
          preferences={preferences}
          onSave={savePreferences}
          canOpenAdmin={canOpenTab("admin")}
          onOpenAdminPinEntry={handleOpenAdminPinEntry}
        />
      );
    }
    return <DesktopAdminView key={key} globalSearch="" onStatusChange={handleStatusChange} />;
    // deps 는 실제로 렌더 결과를 바꾸는 값만 나열. handleStatusChange(useCallback []),
    // setStockWarnings(setter), handleTabChange 는 안정적이거나 결과에
    // 영향이 없어 의도적으로 제외 — 누락이 아니라 최소 deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costHeaderTarget, contentTab, refreshNonce, adminPinEntryNonce, warehousePreselected, warehouseIntent, handleGoToWarehouse, handleGoToDefect, clearWarehouseEntry, canOpenWarehouse, canReceive, capacityData, capacityLoading, capacityError, capacityRefreshKey, refetchCapacity, weekMon, defectDeptFilter, operator, warehouseMapFullscreen, isItemPickerFullscreen, isDefectItemPickerFullscreen, preferences, savePreferences, canOpenTab, handleOpenAdminPinEntry, handleDailyReportTopbarControlsChange, retainStocktake, stocktakeAccessPending]);

  return (
    <>
      <div className="flex h-screen overflow-hidden">
        <div
          data-testid="desktop-shell-frame"
          className="flex h-full w-full gap-3 px-3 py-3"
          style={{
            background: LEGACY_COLORS.bg,
            color: LEGACY_COLORS.text,
          }}
        >
          <DesktopSidebar
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onOpenAdminPinEntry={handleOpenAdminPinEntry}
            visibleTabs={visibleTabs}
            sidebarMode={preferences.sidebarMode}
          />

          <div className="min-w-0 flex-1 flex flex-col">
            {!hideTopbar && (
              <DesktopTopbar
                centerContent={activeTab === "dashboard" ? <div ref={setCostHeaderTarget} className="flex items-center" /> : undefined}
                title={activeMeta.title}
              icon={activeMeta.icon}
              iconColor={DESKTOP_TAB_ICON_COLORS[activeTab]}
              onRefresh={() => {
                if (!canOpenTab(activeTab)) return;
                const refresh = () => { if (activeTab === "dashboard") { setCapacityRefreshKey(value => value + 1); void queryClient.invalidateQueries({ queryKey: queryKeys.items.all }); void queryClient.invalidateQueries({ queryKey: queryKeys.costs.all }); } else setRefreshNonce((current) => current + 1); void refetchCapacity(); };
                if (activeTab === "stocktake" || activeTab === "dashboard") confirmAdminNavigation(refresh);
                else refresh();
              }}
              onBeforeLogout={activeTab === "stocktake" ? flushDirtyEntries : undefined}
              status={status}
              statusNonce={statusNonce}
              titleAddon={
                !canOpenTab(activeTab) ? undefined : activeTab === "weekly" ? (
                  <WeeklyWeekPicker weekMon={weekMon} onChange={setWeekMon} />
                ) : activeTab === "dailyReport" ? dailyReportTopbarControls : undefined
              }
                onNavigate={handleNotificationNavigate}
              />
            )}

            <div className={`${hideTopbar ? "" : "mt-3"} desktop-tab-content min-h-0 flex-1 overflow-hidden flex`}>
              <div
                key={activeTab}
                ref={homeMotionRef}
                data-testid="desktop-tab-transition"
                data-active-tab={activeTab}
                className="animate-desktop-navigation-enter flex min-h-0 min-w-0 flex-1"
              >
                <AccessRevocationGuard allowed={!operator || canOpenTab(activeTab) || (activeTab === "stocktake" && stocktakeAccessPending)} onLeave={() => commitDesktopTab(fallbackTab, { navigation: "replace" })}>
                {activeTab === "dashboard" || activeTab === "history" ? (
                  <DesktopDataTransition ready={activeTab === contentTab} tab={activeTab} dashboardScrollGeometry={dashboardScrollGeometry}>
                    {content}
                  </DesktopDataTransition>
                ) : content}
                </AccessRevocationGuard>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/** 메뉴·제목을 먼저 그리는 동안 대상 화면의 공간을 유지한다. */
function DesktopDataTransition({ ready, tab, children, dashboardScrollGeometry }: {
  ready: boolean;
  tab: DesktopTabId;
  children: ReactNode;
  dashboardScrollGeometry: RefObject<DashboardScrollGeometry | null>;
}) {
  const [coverVisible, setCoverVisible] = useState(!ready);
  const rootRef = useRef<HTMLDivElement>(null);
  const [scrollGeometry, setScrollGeometry] = useState(dashboardScrollGeometry.current);

  // 이미지가 있는 행은 더 높으므로 행 수로 스크롤 길이를 추정하지 않는다.
  useLayoutEffect(() => {
    if (tab !== "dashboard") return;
    const root = rootRef.current;
    const viewport = root?.querySelector<HTMLElement>('[data-testid="inventory-left-content"]');
    if (!viewport) {
      const loading = root?.querySelector<HTMLElement>('[data-testid="dashboard-loading-scroll"]');
      if (loading?.clientWidth && loading.clientWidth !== dashboardScrollGeometry.current?.width) setScrollGeometry(null);
      return;
    }
    const measure = () => {
      if (!viewport.clientWidth || !viewport.scrollHeight) return;
      const next = { height: viewport.scrollHeight, width: viewport.clientWidth };
      dashboardScrollGeometry.current = next;
      setScrollGeometry((previous) => previous?.height === next.height && previous.width === next.width ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    const surface = viewport.querySelector('[data-testid="inventory-scroll-surface"]');
    if (surface) observer.observe(surface);
    return () => observer.disconnect();
  }, [ready, tab, dashboardScrollGeometry]);

  // 실제 내용을 먼저 마운트하고 덮개만 걷어내므로 카드와 검색창이 배경으로 깜빡이지 않는다.
  useEffect(() => {
    if (!ready || !coverVisible) return;
    const timer = window.setTimeout(() => setCoverVisible(false), 180);
    return () => window.clearTimeout(timer);
  }, [ready, coverVisible]);

  return (
    <div ref={rootRef} className="desktop-data-transition relative flex min-h-0 min-w-0 flex-1">
      {ready && children}
      {coverVisible && (
        <div
          data-testid="desktop-loading-cover"
          aria-hidden={ready || undefined}
          inert={ready || undefined}
          className={`absolute inset-0 z-40 flex ${ready ? "desktop-loading-cover-exit pointer-events-none" : ""}`}
          style={{ background: LEGACY_COLORS.bg }}
        >
          <DesktopTabLoading tab={tab} dashboardScrollHeight={scrollGeometry?.height} />
        </div>
      )}
    </div>
  );
}

function DesktopTabLoading({ tab, dashboardScrollHeight }: { tab: DesktopTabId; dashboardScrollHeight?: number }) {
  if (tab === "dashboard") return <DashboardTabLoading scrollHeight={dashboardScrollHeight} />;
  if (tab === "history") return <HistoryTabLoading />;
  return null;
}

function DashboardTabLoading({ scrollHeight }: { scrollHeight?: number }) {
  return <div role="status" aria-busy="true" aria-label="대시보드 화면을 불러오는 중입니다" className="flex min-h-0 min-w-0 flex-1 pl-0 lg:pr-4">
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div data-testid="dashboard-loading-scroll" className="sg min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable] sm:block sm:overflow-y-scroll"
        style={{ overflowY: scrollHeight === undefined ? "hidden" : undefined }}>
        <div className="min-h-full" style={scrollHeight === undefined ? undefined : { height: scrollHeight, overflow: "hidden" }}>
          <div className="flex flex-col gap-3">
            <section className="card desktop-flat-surface" style={{ padding: "14px 16px" }}>
              <InventoryKpiPanel cards={[]} activeKey="ALL" onChange={() => {}} loading />

            </section>
            <section aria-label="자재 목록" className="card desktop-flat-surface flex flex-1 flex-col">
              <InventoryTableStickyHeader searchActions={<InventoryFilterToggleButton filtersOpen={false} logic="AND" onLogicChange={() => {}} onToggle={() => {}} disabled />} searchValue="" searchPlaceholder="품명 · 품목 코드 · 검색용 이름" onSearchChange={() => {}} onManageSearch={() => {}} count={0} isFiltered={false} disabled />
              <InventoryItemsTable loading error={null} filteredItems={[]} displayLimit={100}
                setDisplayLimit={() => {}} selectedItem={null} onSelectItem={() => {}} activeFilterCount={0}
                hasKpiFilter={false} onRetry={() => {}} onResetAllFilters={() => {}} />
            </section>
          </div>
        </div>
      </div>
    </div>
  </div>;
}

function HistoryTabLoading() {
  return <div role="status" aria-busy="true" aria-label="입출고 내역 화면을 불러오는 중입니다" className="flex min-h-0 min-w-0 flex-1 pl-0 lg:pr-1">
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="sg min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable] sm:block sm:overflow-y-scroll">
        <div className="min-h-full">
          <div className="flex flex-col gap-2">
            <HistoryStatsBar baseline={null} currentCount={null} loading loadingDisplay="skeleton" periodLabel="이번달" hasListFilters={false} />
            <HistoryFilterBar search="" setSearch={() => {}} dateFilter="MONTH" setDateFilter={() => {}}
              filterPanelOpen={false} onToggleFilterPanel={() => {}} activeFilterCount={0}
              calendarOpen={false} onToggleCalendar={() => {}} selectedDay={null} onClearSelectedDay={() => {}}
              selectedMonth={null} onClearSelectedMonth={() => {}} flatSurface disabled />
            <HistoryTableSkeleton />
          </div>
        </div>
      </div>
    </div>
  </div>;
}
