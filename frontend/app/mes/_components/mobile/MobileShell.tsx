"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart2,
  Boxes,
  History as HistoryIcon,
  MapPinned,
  MoreHorizontal,
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
  MobileWarehouseMapScreen,
  MobileAdminScreen,
} from "./screens";
import { WeeklyWeekPicker, getWeekStartMonday } from "../_weekly_sections/WeeklyWeekPicker";
import { api, type ProductionCapacity } from "@/lib/api";
import type { Item } from "@/lib/api";
import { CapacityDetailModal } from "../CapacityDetailModal";
import { useCurrentOperator } from "../login/useCurrentOperator";
import { NotificationBell } from "../notifications/NotificationBell";
import { canEnterIO } from "../_warehouse_steps";
import { MobileUserMenuSheet } from "./MobileUserMenuSheet";
import { MobileMoreSheet } from "./MobileMoreSheet";
import { DirtyGuardProvider } from "@/lib/ui/dirty-guard";

export type MobileTabId = "dashboard" | "warehouse" | "defect" | "history" | "weekly" | "warehouseMap" | "admin";

const TAB_META: Record<MobileTabId, { label: string; icon: LucideIcon }> = {
  dashboard: { label: "대시보드", icon: Boxes },
  warehouse: { label: "입출고", icon: Warehouse },
  defect: { label: "불량", icon: AlertTriangle },
  history: { label: "내역", icon: HistoryIcon },
  weekly: { label: "주간보고", icon: BarChart2 },
  warehouseMap: { label: "창고지도", icon: MapPinned },
  admin: { label: "관리", icon: Settings2 },
};

// 하단 탭바에 노출되는 4탭. 나머지(주간보고·관리 등)는 하단 더보기 시트로 진입.
// content useMemo·?tab= 딥링크는 7종 전체를 그대로 다루므로 마운트 경로는 유지된다.
const TAB_BAR_IDS: MobileTabId[] = ["dashboard", "warehouse", "defect", "history"];

// 마운트 딥링크(?tab=)·알림 네비가 받아들이는 유효 탭 집합(7종). 알 수 없는 값이 들어오면
// activeTab 이 오염돼 content useMemo 가 엉뚱한 화면으로 떨어지므로 진입 전 검증한다.
const VALID_TAB_IDS: MobileTabId[] = [
  "dashboard",
  "warehouse",
  "defect",
  "history",
  "weekly",
  "warehouseMap",
  "admin",
];

let _toastSeq = 0;

interface ToastItem {
  id: number;
  msg: string;
  type: "success" | "error" | "info";
}

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
      className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 py-1 transition-[transform] active:scale-[0.92]"
      aria-label={label}
      aria-current={active ? "page" : undefined}
    >
      <span
        className="relative inline-flex h-9 w-10 items-center justify-center rounded-full transition-colors"
        style={{
          background: active
            ? `color-mix(in srgb, ${LEGACY_COLORS.blue as string} 16%, transparent)`
            : "transparent",
        }}
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
  const [toastQueue, setToastQueue] = useState<ToastItem[]>([]);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
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
  const [capacityData, setCapacityData] = useState<ProductionCapacity | null>(null);
  const [capacityModal, setCapacityModal] = useState(false);
  const [stockWarnings, setStockWarnings] = useState<{ low: number; zero: number } | null>(null);

  const handleStatusChange = useCallback((msg: string) => {
    const isError = /실패|못했습니다|오류|에러|부족|품절/.test(msg);
    const type: ToastItem["type"] = isError ? "error" : "info";
    const id = ++_toastSeq;
    setToastQueue((q: ToastItem[]) => {
      const next = [...q, { id, msg, type }];
      return next.slice(-5); // 최대 5건 유지
    });
    // info/success 는 routine 알림 — 3.5초 후 자동 소멸(품목 선택마다 쌓여 화면을
    // 가리는 문제 해소). error 는 수동 닫기 유지(느린 네트워크/청각 보조 대응).
    if (type !== "error") {
      setTimeout(() => {
        setToastQueue((q: ToastItem[]) => q.filter((t: ToastItem) => t.id !== id));
      }, 3500);
    }
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
    if (!operator) return TAB_BAR_IDS;
    return TAB_BAR_IDS.filter((tab) => {
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
    if (activeTab === "warehouseMap") {
      return <MobileWarehouseMapScreen key={key} onStatusChange={handleStatusChange} />;
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
    <DirtyGuardProvider>
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
            <div className="ml-2 shrink-0">
              <NotificationBell
                onNavigate={(tab) => {
                  // 알림이 가리키는 탭이 유효할 때만 전환(숨김탭 weekly/warehouseMap/admin
                  // 도 화면은 정상 렌더). 알 수 없는 값이면 무시해 오작동 방지.
                  if ((VALID_TAB_IDS as string[]).includes(tab)) {
                    handleTabChange(tab as MobileTabId);
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
          className="shrink-0"
          style={{
            background: LEGACY_COLORS.s1,
            boxShadow: "0 -2px 8px rgba(0,0,0,0.12)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 10px))",
          }}
        >
          <div className="flex px-2 pt-2">
            {visibleTabs.map((tab) => (
              <NavButton
                key={tab}
                icon={TAB_META[tab].icon}
                label={TAB_META[tab].label}
                active={tab === activeTab}
                onClick={() => handleTabChange(tab)}
              />
            ))}
            {/* 더보기 — 강등된 화면(주간보고·창고지도·관리)으로의 진입.
                실제 탭 전환이 아니라 시트만 열므로 항상 비활성 스타일. */}
            <NavButton
              key="__more"
              icon={MoreHorizontal}
              label="더보기"
              active={false}
              onClick={() => setMoreSheetOpen(true)}
            />
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

      <MobileMoreSheet
        open={moreSheetOpen}
        onClose={() => setMoreSheetOpen(false)}
        onWeekly={() => handleTabChange("weekly")}
        onWarehouseMap={() => handleTabChange("warehouseMap")}
        onAdmin={() => handleTabChange("admin")}
      />
    </div>
    </DirtyGuardProvider>
  );
}
