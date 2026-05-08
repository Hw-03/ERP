"use client";

import { useMemo, useState } from "react";
import {
  Bell,
  History as HistoryIcon,
  Home,
  MoreHorizontal,
  Package,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { ELEVATION, TYPO } from "./tokens";
import { AlertsSheet } from "./AlertsSheet";
import { IconButton } from "./primitives";
import { canEnterIO } from "../_warehouse_steps";
import { useCurrentOperator } from "../login/useCurrentOperator";

export type TabId =
  | "home"
  | "inventory"
  | "warehouse"
  | "dept"
  | "history"
  | "admin"
  | "more";

/**
 * 하단 네비에 노출되는 탭은 5개로 제한. dept/admin 은 더보기 메뉴에서 진입.
 * Phase 3A 에서 warehouse/dept 를 단일 io 탭으로 통합 후 작성/이어쓰기/내요청/승인함 슬라이드 탭 도입 예정.
 */
const ALL_TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "홈", icon: Home },
  { id: "inventory", label: "재고", icon: Package },
  { id: "warehouse", label: "입출고", icon: Warehouse },
  { id: "history", label: "내역", icon: HistoryIcon },
  { id: "more", label: "더보기", icon: MoreHorizontal },
];

export function MobileShell({
  activeTab,
  onTabChange,
  title,
  subtitle,
  headerRight,
  children,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  title: string;
  subtitle: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [alertsOpen, setAlertsOpen] = useState(false);
  const operator = useCurrentOperator();
  const tabs = useMemo(() => {
    // operator 가 아직 로드되지 않은 경우 기존대로 모든 탭 표시 (게이트가 막아주므로 안전).
    if (!operator) return ALL_TABS;
    return ALL_TABS.filter((tab) => {
      if (tab.id === "warehouse" || tab.id === "dept") return canEnterIO(operator);
      return true;
    });
  }, [operator]);

  return (
    // 모바일에서는 full width — 검은 프레임은 데스크탑 프리뷰(sm 이상)에만 표시.
    <div className="h-screen overflow-hidden sm:bg-black">
      <div
        className="mx-auto flex h-full flex-col overflow-hidden sm:max-w-[430px] sm:shadow-[0_0_60px_rgba(0,0,0,.8)]"
        style={{
          background: LEGACY_COLORS.bg,
          color: LEGACY_COLORS.text,
        }}
      >
        <div
          className="shrink-0"
          style={{
            height: "env(safe-area-inset-top, 18px)",
            background: `linear-gradient(180deg, ${LEGACY_COLORS.s1 as string} 0%, ${LEGACY_COLORS.s1 as string} 100%)`,
          }}
        />

        <header
          className="relative flex shrink-0 items-end justify-between px-5 pb-3 pt-2"
          style={{
            background: LEGACY_COLORS.s1,
            boxShadow: ELEVATION.sticky,
          }}
        >
          <div className="min-w-0 flex-1">
            <div
              className={clsx(TYPO.overline, "font-bold uppercase tracking-[2.5px]")}
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              {subtitle}
            </div>
            <div
              className={clsx(TYPO.headline, "font-black leading-tight")}
              style={{ color: LEGACY_COLORS.text }}
            >
              {title}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {headerRight}
            <IconButton icon={Bell} label="알림" size="md" onClick={() => setAlertsOpen(true)} />
          </div>
        </header>

        <main className="relative flex-1 overflow-y-auto">{children}</main>

        <nav
          className="shrink-0"
          style={{
            background: LEGACY_COLORS.s1,
            boxShadow: "0 -8px 20px rgba(0,0,0,.28)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 10px))",
          }}
        >
          <div className="flex px-2 pt-2">
            {tabs.map((tab) => {
              const active = tab.id === activeTab;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className="flex flex-1 flex-col items-center gap-[3px] py-1 transition-[transform] active:scale-[0.92]"
                  aria-label={tab.label}
                  aria-current={active ? "page" : undefined}
                >
                  <span
                    className={clsx(
                      "relative inline-flex h-9 w-[48px] items-center justify-center rounded-full transition-colors",
                    )}
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
                    className={clsx(TYPO.overline, active ? "font-black" : "font-semibold")}
                    style={{
                      color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted,
                      letterSpacing: "0.5px",
                    }}
                  >
                    {tab.label}
                  </div>
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      <AlertsSheet open={alertsOpen} onClose={() => setAlertsOpen(false)} />
    </div>
  );
}
