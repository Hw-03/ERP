"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart2,
  Boxes,
  History as HistoryIcon,
  MapPinned,
  MoreHorizontal,
  PackageCheck,
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
  MobileWarehouseMapScreen,
  MobileMoreScreen,
  MobileShippingScreen,
} from "./screens";
import { WeeklyWeekPicker, getWeekStartMonday } from "../_weekly_sections/WeeklyWeekPicker";
import { api, type ProductionCapacity } from "@/lib/api";
import type { Item } from "@/lib/api";
import { CapacityDetailModal } from "../CapacityDetailModal";
import { useCurrentOperator } from "../login/useCurrentOperator";
import { NotificationBell } from "../notifications/NotificationBell";
import { StatusPill, inferToneFromStatus } from "../common";
import { canEnterIO } from "../_warehouse_steps";
import { canSeeWorkType } from "../_warehouse_v2/ioWorkType";
import type { IoEntryIntent } from "../_warehouse_v2/types";
import { MobileUserMenuSheet } from "./MobileUserMenuSheet";
import { MobileDirtyLeaveSheet } from "./warehouse/MobileDirtyLeaveSheet";
import type { MobileMoreEntryId } from "./screens/MobileMoreScreen";
import {
  MOBILE_MORE_ENTRY_TAB_IDS,
  isSidebarTabVisible,
  mobileMoreHasVisibleEntries,
} from "../tabAccess";

// 관리(admin)는 모바일에서 제외 — 관리 작업은 데스크톱(PC)에서 한다.
export type MobileTabId =
  | "dashboard"
  | "warehouse"
  | "defect"
  | "history"
  | "more"
  | "weekly"
  | "warehouseMap"
  | "shipping";

const TAB_META: Record<MobileTabId, { label: string; icon: LucideIcon }> = {
  dashboard: { label: "대시보드", icon: Boxes },
  warehouse: { label: "입출고", icon: Warehouse },
  defect: { label: "불량", icon: AlertTriangle },
  history: { label: "내역", icon: HistoryIcon },
  more: { label: "더보기", icon: MoreHorizontal },
  shipping: { label: "출하", icon: PackageCheck },
  weekly: { label: "주간보고", icon: BarChart2 },
  warehouseMap: { label: "창고지도", icon: MapPinned },
};

// 하단 탭바에 노출되는 5탭. 더보기는 전폭 화면(출하·주간보고·창고지도)으로 진입한다.
const TAB_BAR_IDS: MobileTabId[] = ["dashboard", "warehouse", "defect", "history", "more"];

// 마운트 딥링크(?tab=)·알림 네비가 받아들이는 유효 탭 집합. 알 수 없는 값(예: admin)이
// 들어오면 무시되어 기본 dashboard 가 유지된다.
const VALID_TAB_IDS: MobileTabId[] = [
  "dashboard",
  "warehouse",
  "defect",
  "history",
  "more",
  "weekly",
  "warehouseMap",
  "shipping",
];

// 항목 3-1 — 데스크톱 상단바와 동일한 기본 브랜드 상태 텍스트.
const DEFAULT_STATUS = "DEXCOWIN MES System";

/**
 * 하단 탭바 버튼 — 4개 탭 + "더보기"가 같은 형태를 공유한다.
 * 활성 표시: 데스크톱 사이드바 톤에 맞춰 또렷한 blue tint pill + 고정 strokeWidth.
 */
function NavButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="no-btn-inset flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 py-1 outline-none transition-[transform] active:scale-[0.92]"
      style={{ WebkitTapHighlightColor: "transparent" }}
      aria-label={label}
      aria-current={active ? "page" : undefined}
    >
      <span
        className="relative inline-flex h-9 w-10 items-center justify-center rounded-full transition-colors"
        style={{ background: "transparent" }}
      >
        <Icon size={20} strokeWidth={2} color={active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2} />
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
        {label}
      </div>
    </button>
  );
}

export function MobileShell() {
  const operator = useCurrentOperator();
  const [activeTab, setActiveTab] = useState<MobileTabId>("dashboard");
  // 항목 3-1 — 데스크톱 상단바와 동일: 모든 상태/알림(info·에러)을 헤더 상태 칩 하나에 표시.
  // 기본은 brand "DEXCOWIN MES System", 메시지 도착 시 일시 표시 후 3초 뒤 복귀(에러는 sticky).
  const [headerStatus, setHeaderStatus] = useState(DEFAULT_STATUS);
  const [statusNonce, setStatusNonce] = useState(0);
  const headerStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [defectDeptFilter, setDefectDeptFilter] = useState<string | null>(null);

  // URL ?tab= / ?defect_dept= 으로 초기 상태 동기화.
  // useSearchParams 의 Suspense 요구를 피하려 클라이언트 마운트 시 1회만 읽는다.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t && (VALID_TAB_IDS as string[]).includes(t)) setActiveTab(t as MobileTabId);
    const d = params.get("defect_dept");
    if (d) setDefectDeptFilter(d);
  }, []);

  const [weekMon, setWeekMon] = useState<Date>(() => getWeekStartMonday(new Date()));
  const [warehousePreselected, setWarehousePreselected] = useState<Item | null>(null);
  const [warehouseIntent, setWarehouseIntent] = useState<IoEntryIntent | null>(null);
  const [capacityData, setCapacityData] = useState<ProductionCapacity | null>(null);
  const [capacityModal, setCapacityModal] = useState(false);
  const [stockWarnings, setStockWarnings] = useState<{ low: number; zero: number } | null>(null);
  // 항목 16 — 입출고 작성 중(담은 묶음 있음) 하단 네비로 이탈 시 확인 시트.
  const [warehouseDirty, setWarehouseDirty] = useState(false);
  const warehouseFlushRef = useRef<(() => void) | null>(null);
  const [pendingNavTab, setPendingNavTab] = useState<MobileTabId | null>(null);

  // 항목 3-1 — 데스크톱 DesktopMesShell.handleStatusChange 와 동일 로직: 모든 메시지를 헤더 칩에.
  // 기본 복귀, 에러(sticky)는 자동 복귀 안 함. (기존 "에러만 하단 토스트" 분리는 제거.)
  const handleStatusChange = useCallback((msg: string) => {
    if (headerStatusTimerRef.current) clearTimeout(headerStatusTimerRef.current);
    setHeaderStatus(msg);
    setStatusNonce((n) => n + 1);
    if (msg === DEFAULT_STATUS) return;
    const isSticky = /실패|못했습니다|오류|에러|부족|품절/.test(msg);
    if (!isSticky) {
      headerStatusTimerRef.current = setTimeout(() => {
        setHeaderStatus(DEFAULT_STATUS);
        setStatusNonce((n) => n + 1);
      }, 3000);
    }
  }, []);

  const canOpenMobileTab = useCallback((tab: MobileTabId) => {
    if (!operator) return true;
    if (tab === "more") return mobileMoreHasVisibleEntries(operator);
    if ((tab === "warehouse" || tab === "defect") && !canEnterIO(operator)) return false;
    return isSidebarTabVisible(tab, operator);
  }, [operator]);

  const visibleTabs = useMemo(
    () => TAB_BAR_IDS.filter((tab) => canOpenMobileTab(tab)),
    [canOpenMobileTab],
  );
  const fallbackTab = visibleTabs[0] ?? "dashboard";
  const visibleMoreEntries = useMemo(
    () => MOBILE_MORE_ENTRY_TAB_IDS.filter((tab) => isSidebarTabVisible(tab, operator)) as MobileMoreEntryId[],
    [operator],
  );

  useEffect(() => {
    if (!operator) return;
    if (!canOpenMobileTab(activeTab)) {
      setActiveTab(fallbackTab);
      if (activeTab === "defect") setDefectDeptFilter(null);
    }
  }, [activeTab, canOpenMobileTab, fallbackTab, operator]);

  const handleTabChange = useCallback((tab: MobileTabId) => {
    const target = canOpenMobileTab(tab) ? tab : fallbackTab;
    if (!canOpenMobileTab(target)) return;
    if (target === activeTab) {
      setRefreshNonce((n) => n + 1);
      return;
    }
    // 항목 16 — 입출고 작성 중 다른 탭으로 이탈 시 확인 시트(PC 일관성). 확인 시 draft flush 후 전환.
    if (activeTab === "warehouse" && warehouseDirty) {
      setPendingNavTab(target);
      return;
    }
    setActiveTab(target);
  }, [activeTab, canOpenMobileTab, fallbackTab, warehouseDirty]);

  const canReceive = canSeeWorkType("receive", operator) && canOpenMobileTab("warehouse");

  const handleGoToWarehouse = useCallback((item: Item, intent?: IoEntryIntent) => {
    if (!canOpenMobileTab("warehouse")) return;
    setWarehousePreselected(item);
    setWarehouseIntent(intent ?? null);
    setActiveTab("warehouse");
  }, [canOpenMobileTab]);

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


  const containerRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  // 항목 2-9 — weekly/warehouseMap 은 '더보기' 탭으로 진입한 하위 화면이라 TAB_BAR_IDS 에 없다.
  // 하단 네비에선 '더보기' 슬롯을 활성으로 매핑해 pill·강조가 더보기에 붙도록 한다.
  const isMoreSubScreen = activeTab === "weekly" || activeTab === "warehouseMap" || activeTab === "shipping";
  const effectiveNavTab: MobileTabId = isMoreSubScreen ? "more" : activeTab;
  const activeIndex = visibleTabs.indexOf(effectiveNavTab);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || activeIndex < 0) { setPill(null); return; }
    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>("button"));
    const btn = buttons[activeIndex];
    if (!btn) { setPill(null); return; }
    const h = el.offsetHeight - 8; // top:4 + bottom:4 제거한 실제 pill 높이
    const w = Math.round(h * 1.1
      
    ); // 높이의 1.4배 → 둥근 직사각형
    setPill({ left: btn.offsetLeft + (btn.offsetWidth - w) / 2, width: w });
  }, [activeIndex, visibleTabs.length]);

  const content = useMemo(() => {
    const key = `${activeTab}-${refreshNonce}`;
    if (!canOpenMobileTab(activeTab)) return null;
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
          canReceive={canReceive}
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
          entryIntent={warehouseIntent}
          onSubmitSuccess={loadCapacity}
          onComposeDirtyChange={setWarehouseDirty}
          flushDraftRef={warehouseFlushRef}
        />
      );
    }
    if (activeTab === "defect") {
      return <MobileDefectScreen key={key} defectDeptFilter={defectDeptFilter} />;
    }
    if (activeTab === "history") {
      return <MobileHistoryScreen key={key} />;
    }
    if (activeTab === "more") {
      return (
        <MobileMoreScreen
          key={key}
          onWeekly={() => handleTabChange("weekly")}
          onShipping={() => handleTabChange("shipping")}
          onWarehouseMap={() => handleTabChange("warehouseMap")}
          visibleEntries={visibleMoreEntries}
        />
      );
    }
    if (activeTab === "shipping") {
      return <MobileShippingScreen key={key} />;
    }
    if (activeTab === "weekly") {
      return <MobileWeeklyScreen key={key} weekMon={weekMon} />;
    }
    if (activeTab === "warehouseMap") {
      return (
        <MobileWarehouseMapScreen
          key={key}
          onStatusChange={handleStatusChange}
          onExit={() => handleTabChange("more")}
        />
      );
    }
    return null;
  }, [
    activeTab,
    refreshNonce,
    warehousePreselected,
    warehouseIntent,
    handleGoToWarehouse,
    handleStatusChange,
    canOpenMobileTab,
    canReceive,
    capacityData,
    weekMon,
    handleTabChange,
    loadCapacity,
    defectDeptFilter,
    visibleMoreEntries,
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
            {activeTab !== "weekly" && (
              // 항목 3-1 — 데스크톱 상단바와 동일한 상태 칩(StatusPill). 기본 brand, 메시지 도착 시 tone 추론.
              <span
                key={statusNonce}
                role="status"
                aria-live="polite"
                style={{ animation: "statusFlash 0.35s ease-out" }}
              >
                <StatusPill
                  tone={headerStatus === DEFAULT_STATUS ? "brand" : inferToneFromStatus(headerStatus)}
                  label={headerStatus}
                  title={headerStatus}
                  maxWidth="100%"
                  className={headerStatus === DEFAULT_STATUS ? "font-black tracking-[0.04em]" : ""}
                />
              </span>
            )}
          </div>
          {activeTab === "weekly" && (
            <div className="flex items-center gap-2 shrink-0">
              <WeeklyWeekPicker weekMon={weekMon} onChange={setWeekMon} />
            </div>
          )}
          {operator && (
            <div className="ml-2 shrink-0">
              <NotificationBell
                onNavigate={(tab) => {
                  // 알림이 가리키는 탭이 유효하고 현재 직원에게 보일 때만 전환한다.
                  if ((VALID_TAB_IDS as string[]).includes(tab)) {
                    const target = tab as MobileTabId;
                    if (canOpenMobileTab(target)) handleTabChange(target);
                  }
                }}
              />
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
          className="shrink-0 px-3"
          style={{
            paddingTop: "8px",
            paddingBottom: "calc(env(safe-area-inset-bottom, 10px) + 8px)",
          }}
        >
          <div
            ref={containerRef}
            className="relative flex rounded-[28px] border px-2 py-1"
            style={{
              background: LEGACY_COLORS.s1,
              borderColor: LEGACY_COLORS.border,
            }}
          >
            {pill && (
              <div
                className="pointer-events-none absolute rounded-full"
                style={{
                  top: 4,
                  bottom: 4,
                  left: pill.left,
                  width: pill.width,
                  background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 16%, transparent)`,
                  transition:
                    "left 0.32s cubic-bezier(0.34,1.56,0.64,1), width 0.32s cubic-bezier(0.34,1.56,0.64,1)",
                }}
              />
            )}
            {visibleTabs.map((tab) => {
              // 항목 2-9 — 더보기 슬롯은 weekly/warehouseMap 진입 시 그 화면의 아이콘·라벨로 교체.
              // (NavButton/pill 의 시각 디자인은 고정 — 넘기는 icon/label/active 만 바꾼다.)
              const meta = tab === "more" && isMoreSubScreen ? TAB_META[activeTab] : TAB_META[tab];
              return (
                <NavButton
                  key={tab}
                  icon={meta.icon}
                  label={meta.label}
                  active={tab === effectiveNavTab}
                  onClick={() => handleTabChange(tab)}
                />
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

      {/* 항목 3-1 — 기존 하단 토스트 큐 제거(에러 포함 모든 메시지를 상단 헤더 칩으로 통일). */}

      {/* 항목 16 — 입출고 작성 중 하단 네비 이탈 확인(draft 자동저장 flush 후 전환) */}
      <MobileDirtyLeaveSheet
        open={pendingNavTab !== null}
        onCancel={() => setPendingNavTab(null)}
        onConfirm={() => {
          warehouseFlushRef.current?.(); // 700ms 디바운스 창의 마지막 변경까지 즉시 저장
          const next = pendingNavTab;
          setPendingNavTab(null);
          setWarehouseDirty(false);
          if (next) setActiveTab(canOpenMobileTab(next) ? next : fallbackTab);
        }}
        onDiscard={() => {
          // 항목 3-4 — 저장(flush) 없이 이동. 위저드는 언마운트되어 작성 내용이 폐기된다.
          const next = pendingNavTab;
          setPendingNavTab(null);
          setWarehouseDirty(false);
          if (next) setActiveTab(canOpenMobileTab(next) ? next : fallbackTab);
        }}
      />

      <MobileUserMenuSheet
        open={userMenuOpen}
        onClose={() => setUserMenuOpen(false)}
      />
    </div>
  );
}
