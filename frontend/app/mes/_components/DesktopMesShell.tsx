"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ElementType } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BarChart2, Boxes, History, MapPinned, Settings2, Truck, Warehouse } from "lucide-react";
import { DESKTOP_TAB_ICON_COLORS, DesktopSidebar, type DesktopTabId } from "./DesktopSidebar";
import { DesktopTopbar } from "./DesktopTopbar";
import { DesktopInventoryView } from "./DesktopInventoryView";
import { DesktopWarehouseView } from "./DesktopWarehouseView";
import { DesktopShippingView } from "./DesktopShippingView";
import { DesktopWarehouseMapTab } from "./DesktopWarehouseMapTab";
import { DesktopDefectView } from "./DesktopDefectView";
import { DesktopAdminView } from "./DesktopAdminView";
import { DesktopHistoryView } from "./DesktopHistoryView";
import { DesktopWeeklyReportView } from "./DesktopWeeklyReportView";
import { useCurrentOperator } from "./login/useCurrentOperator";
import {
  WeeklyWeekPicker,
  getWeekStartMonday,
} from "./_weekly_sections/WeeklyWeekPicker";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { api } from "@/lib/api";
import type { Item, ProductionCapacity } from "@/lib/api";
import { productionApi } from "@/lib/api/production";
import { warehouseMapApi } from "@/lib/api/warehouse-map";
import { STALE_TIME } from "@/lib/queries/client";
import { queryKeys } from "@/lib/queries/keys";
import { useProductionCapacityQuery } from "@/lib/queries/useProductionQuery";
import { sendClientEvent } from "@/lib/client-events";
import { CapacityDetailModal } from "./CapacityDetailModal";
import { DirtyGuardProvider, useConfirmNavigation } from "@/lib/ui/dirty-guard";
import { canSeeWorkType } from "./_warehouse_v2/ioWorkType";
import type { IoEntryIntent } from "./_warehouse_v2/types";
import { HISTORY_PAGE_SIZE } from "./_history_sections/historyConstants";
import { dateFilterToFrom } from "./_history_sections/historyQuery";
import {
  filterVisibleSidebarTabs,
  SIDEBAR_TAB_IDS,
} from "./tabAccess";

const VALID_TABS = new Set<DesktopTabId>(SIDEBAR_TAB_IDS);
const DEFAULT_STATUS = "DEXCOWIN MES System";
const MS_PER_DAY = 86400000;

type DesktopTabNavigation = "push" | "replace" | "none";

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const TAB_META: Record<DesktopTabId, { title: string; icon: ElementType }> = {
  dashboard: { title: "대시보드", icon: Boxes },
  warehouse: { title: "입출고", icon: Warehouse },
  shipping: { title: "출하", icon: Truck },
  warehouseMap: { title: "창고 지도", icon: MapPinned },
  defect: { title: "불량", icon: AlertTriangle },
  history: { title: "입출고 내역", icon: History },
  weekly: { title: "주간보고", icon: BarChart2 },
  admin: { title: "관리자", icon: Settings2 },
};

export function DesktopMesShell() {
  return (
    <DirtyGuardProvider>
      <DesktopMesShellInner />
    </DirtyGuardProvider>
  );
}

function DesktopMesShellInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirmAdminNavigation = useConfirmNavigation();
  const operator = useCurrentOperator();
  const visibleTabs = useMemo(
    () => filterVisibleSidebarTabs(SIDEBAR_TAB_IDS, operator),
    [operator],
  );
  const fallbackTab = visibleTabs[0] ?? "dashboard";
  const canOpenTab = useCallback(
    (tab: DesktopTabId) => visibleTabs.includes(tab),
    [visibleTabs],
  );

  const initialTab = (() => {
    const t = searchParams.get("tab") as DesktopTabId | null;
    return t && VALID_TABS.has(t) ? t : "dashboard";
  })();

  const [activeTab, setActiveTab] = useState<DesktopTabId>(initialTab);
  const [status, setStatus] = useState(DEFAULT_STATUS);
  const [statusNonce, setStatusNonce] = useState(0);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [warehouseMapFullscreen, setWarehouseMapFullscreen] = useState(false);
  const autoRevertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUrlTabRef = useRef<DesktopTabId | null>(null);

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
    if (warehouseMapFullscreen && tab === activeTab) {
      commitDesktopTab(tab, { navigation: "none" });
      return;
    }
    if (!canOpenTab(tab)) {
      if (fallbackTab !== activeTab) {
        commitDesktopTab(fallbackTab);
      }
      return;
    }
    if (tab === activeTab) {
      const doReset = () => {
        if (tab === "warehouse" || tab === "shipping") {
          router.push(`?tab=${tab}`, { scroll: false });
        }
        if (tab !== "admin") {
          setRefreshNonce((n) => n + 1);
        }
      };
      if (tab === "warehouse" || tab === "shipping") {
        confirmAdminNavigation(doReset);
      } else {
        doReset();
      }
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

  // 알림 클릭 딥링크 — 해당 탭(+섹션)으로 이동. section 은 입출고 섹션(queue/dept-queue/mine).
  function handleNotificationNavigate(tab: string, section: string | null) {
    if (!VALID_TABS.has(tab as DesktopTabId) || !canOpenTab(tab as DesktopTabId)) return;
    const target = tab as DesktopTabId;
    confirmAdminNavigation(() => {
      const url = section ? `?tab=${target}&section=${section}` : `?tab=${target}`;
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
    const t = searchParams.get("tab") as DesktopTabId | null;
    const dept = searchParams.get("defect_dept");
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
        commitDesktopTab(target, { navigation: "none", closeWarehouseMapFullscreen: false });
      }
      if (target !== targetFromUrl) router.replace(`?tab=${target}`, { scroll: false });
    } else if (!canOpenTab(activeTab)) {
      commitDesktopTab(fallbackTab, { navigation: "replace" });
    }

    setDefectDeptFilter(canOpenTab("defect") ? dept : null);
  }, [searchParams, activeTab, canOpenTab, fallbackTab, router, commitDesktopTab]);

  useEffect(() => {
    if (activeTab !== "warehouseMap" && warehouseMapFullscreen) {
      setWarehouseMapFullscreen(false);
    }
  }, [activeTab, warehouseMapFullscreen]);

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
    const weekStart = toDateStr(weekMon);
    const weekEnd = toDateStr(new Date(weekMon.getTime() + 6 * MS_PER_DAY));

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
  const [defectDeptFilter, setDefectDeptFilter] = useState<string | null>(() => {
    // 초기 URL 에 defect_dept 쿼리가 있으면 읽어 둔다
    return searchParams.get("defect_dept");
  });
  const { data: capacityData = null, refetch: refetchCapacity } = useProductionCapacityQuery();
  const [capacityModal, setCapacityModal] = useState(false);
  const [stockWarnings, setStockWarnings] = useState<{ low: number; zero: number } | null>(null);

  const activeMeta = TAB_META[activeTab];

  const canReceive = canSeeWorkType("receive", operator) && canOpenTab("warehouse");

  const handleGoToWarehouse = useCallback((item: Item, intent?: IoEntryIntent) => {
    if (!canOpenTab("warehouse")) return;
    setWarehousePreselected(item);
    setWarehouseIntent(intent ?? null);
    commitDesktopTab("warehouse");
    // tab 만 전환 — step 은 위저드(useIoUrlSync)가 tab=warehouse 와 함께 기록한다.
  }, [canOpenTab, commitDesktopTab]);

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
          canReceive={canReceive}
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
          entryIntent={warehouseIntent}
          onSubmitSuccess={() => { void refetchCapacity(); }}
        />
      );
    }
    if (activeTab === "shipping") {
      return <DesktopShippingView key={key} operator={operator} onStatusChange={handleStatusChange} />;
    }
    if (activeTab === "warehouseMap") {
      return (
        <DesktopWarehouseMapTab
          key={key}
          onStatusChange={handleStatusChange}
          fullscreen={warehouseMapFullscreen}
          onFullscreenChange={setWarehouseMapFullscreen}
        />
      );
    }
    if (activeTab === "defect") {
      return (
        <DesktopDefectView
          key={key}
          operator={operator}
          defectDeptFilter={defectDeptFilter}
          onStatusChange={handleStatusChange}
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
    // deps 는 실제로 렌더 결과를 바꾸는 값만 나열. handleStatusChange(useCallback []),
    // setStockWarnings/setCapacityModal(setter), handleTabChange 는 안정적이거나 결과에
    // 영향이 없어 의도적으로 제외 — 누락이 아니라 최소 deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, refreshNonce, warehousePreselected, warehouseIntent, handleGoToWarehouse, canReceive, capacityData, refetchCapacity, weekMon, defectDeptFilter, operator, warehouseMapFullscreen]);

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
            visibleTabs={visibleTabs}
          />

          <div className="min-w-0 flex-1 flex flex-col">
            {!warehouseMapFullscreen && (
              <DesktopTopbar
                title={activeMeta.title}
              icon={activeMeta.icon}
              iconColor={DESKTOP_TAB_ICON_COLORS[activeTab]}
              onRefresh={() => {
                setRefreshNonce((current) => current + 1);
                void refetchCapacity();
              }}
              status={status}
              statusNonce={statusNonce}
              titleAddon={
                activeTab === "weekly" ? (
                  <WeeklyWeekPicker weekMon={weekMon} onChange={setWeekMon} />
                ) : undefined
              }
                onNavigate={handleNotificationNavigate}
              />
            )}

            <div className={`${warehouseMapFullscreen ? "" : "mt-1"} desktop-tab-content min-h-0 flex-1 overflow-hidden flex`}>{content}</div>
          </div>
        </div>
      </div>
    </>
  );
}
