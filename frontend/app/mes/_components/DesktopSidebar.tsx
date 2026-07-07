"use client";

import { useState } from "react";
import Image from "next/image";
import type { ElementType } from "react";
import { AlertTriangle, BarChart2, Boxes, History, MapPinned, Settings2, Truck, Warehouse } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { ThemeToggle } from "./ThemeToggle";
import type { DesktopTabId } from "./tabAccess";
export type { DesktopTabId } from "./tabAccess";

type TabDef = { id: DesktopTabId; label: string; subtitle: string; icon: ElementType; color: string };

export const DESKTOP_TAB_ICON_COLORS: Record<DesktopTabId, string> = {
  dashboard: LEGACY_COLORS.blue,
  warehouse: LEGACY_COLORS.green,
  shipping: LEGACY_COLORS.cyan,
  warehouseMap: LEGACY_COLORS.cyan,
  defect: LEGACY_COLORS.red,
  history: LEGACY_COLORS.purple,
  weekly: LEGACY_COLORS.yellow,
  admin: LEGACY_COLORS.muted2,
};
// ??ぉ 3-6 ???ъ씠?쒕컮 ?꾩씠肄섏뿉 ??퀎 怨좎쑀??鍮꾪솢?????쒖떆). ?쒖꽦? 湲곗〈 blue 諛뺤뒪+white ?꾩씠肄??좎?.
const MAIN_TABS: TabDef[] = [
  { id: "dashboard", label: "대시보드", subtitle: "현황과 안전재고 확인", icon: Boxes, color: DESKTOP_TAB_ICON_COLORS.dashboard },
  { id: "warehouse", label: "입출고", subtitle: "입고와 출고 작업 처리", icon: Warehouse, color: DESKTOP_TAB_ICON_COLORS.warehouse },
  { id: "history", label: "입출고 내역", subtitle: "입출고 이력 조회", icon: History, color: DESKTOP_TAB_ICON_COLORS.history },
  { id: "shipping", label: "출하", subtitle: "요청·준비·픽업 완료", icon: Truck, color: DESKTOP_TAB_ICON_COLORS.shipping },
  { id: "defect", label: "불량", subtitle: "격리·폐기·반품 처리", icon: AlertTriangle, color: DESKTOP_TAB_ICON_COLORS.defect },
  { id: "warehouseMap", label: "창고 지도", subtitle: "위치별 재고 한눈에", icon: MapPinned, color: DESKTOP_TAB_ICON_COLORS.warehouseMap },
  { id: "weekly", label: "주간보고", subtitle: "생산·재고 흐름", icon: BarChart2, color: DESKTOP_TAB_ICON_COLORS.weekly },
];

const BOTTOM_TABS: TabDef[] = [
  { id: "admin", label: "관리", subtitle: "마스터와 운영 설정", icon: Settings2, color: DESKTOP_TAB_ICON_COLORS.admin },
];

export function DesktopSidebar({
  activeTab,
  onTabChange,
  visibleTabs,
}: {
  activeTab: DesktopTabId;
  onTabChange: (tab: DesktopTabId) => void;
  visibleTabs: DesktopTabId[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [hoveredTab, setHoveredTab] = useState<DesktopTabId | null>(null);

  return (
    <div
      className="shrink-0"
      style={{
        width: expanded ? 220 : 72,
        transition: "width 180ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <aside
        className="flex h-full w-full flex-col overflow-hidden rounded-[32px] border px-3 py-5"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: LEGACY_COLORS.border,
          boxShadow: "var(--c-card-shadow)",
        }}
      >
        {/* 濡쒓퀬 */}
        <div
          className="flex items-center justify-center"
          style={{ height: expanded ? 68 : 44, transition: "height 180ms ease", flexShrink: 0 }}
        >
          {/* 異뺤냼 ?곹깭: ?꾩껜 ??濡쒓퀬 */}
          <div
            className="flex w-full items-center justify-center"
            style={{
              opacity: expanded ? 0 : 1,
              transition: "opacity 180ms ease",
              pointerEvents: expanded ? "none" : "auto",
              position: expanded ? "absolute" : "relative",
            }}
          >
            <Image
              src="/dexcowin-logo.png"
              alt="DEXCOWIN"
              width={54}
              height={18}
              style={{ width: 54, height: "auto" }}
              className="object-contain"
              priority
            />
          </div>
          {/* ?뺤옣 ?곹깭: ??濡쒓퀬 */}
          <div
            style={{
              opacity: expanded ? 1 : 0,
              transform: expanded ? "translateX(0)" : "translateX(-8px)",
              transition: "opacity 180ms ease, transform 180ms ease",
              pointerEvents: expanded ? "auto" : "none",
              position: expanded ? "relative" : "absolute",
            }}
          >
            <Image
              src="/dexcowin-logo.png"
              alt="DEXCOWIN"
              width={168}
              height={56}
              style={{ width: 168, height: "auto" }}
              className="object-contain"
              priority
            />
          </div>
        </div>

        {/* ???대퉬寃뚯씠??*/}
        <nav className="mt-5 space-y-1.5">
          {MAIN_TABS.filter((tab) => visibleTabs.includes(tab.id)).map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab}
              active={tab.id === activeTab}
              expanded={expanded}
              hovered={hoveredTab === tab.id}
              onTabChange={onTabChange}
              onHover={setHoveredTab}
            />
          ))}
        </nav>

        {/* ?섎떒 怨좎젙: 愿由?+ ?뚮쭏 */}
        <div className="mt-auto space-y-1.5 pt-1.5">
          {BOTTOM_TABS.filter((tab) => visibleTabs.includes(tab.id)).map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab}
              active={tab.id === activeTab}
              expanded={expanded}
              hovered={hoveredTab === tab.id}
              onTabChange={onTabChange}
              onHover={setHoveredTab}
            />
          ))}
          <ThemeToggle expanded={expanded} />
        </div>
      </aside>
    </div>
  );
}

function TabButton({
  tab,
  active,
  expanded,
  hovered,
  onTabChange,
  onHover,
}: {
  tab: TabDef;
  active: boolean;
  expanded: boolean;
  hovered: boolean;
  onTabChange: (id: DesktopTabId) => void;
  onHover: (id: DesktopTabId | null) => void;
}) {
  const Icon = tab.icon;
  const iconSizeClass = tab.id === "shipping" ? "h-[22px] w-[22px]" : "h-5 w-5";
  return (
    <button
      onClick={() => onTabChange(tab.id)}
      onMouseEnter={() => onHover(tab.id)}
      onMouseLeave={() => onHover(null)}
      aria-current={active ? "page" : undefined}
      className="group flex items-center justify-start rounded-[20px] -mx-1.5 w-[calc(100%+12px)] pl-1.5 transition-all duration-150 hover:scale-[1.015]"
      style={{
        background: expanded
          ? active
            ? "linear-gradient(135deg, rgba(101,169,255,.16), rgba(78,201,245,.08))"
            : hovered
            ? "color-mix(in srgb, var(--c-cyan) var(--sidebar-hover-mix, 18%), transparent)"
            : "transparent"
          : "transparent",
        boxShadow:
          expanded && hovered && !active
            ? "inset 0 0 0 1px color-mix(in srgb, var(--c-cyan) var(--sidebar-glow-strength, 0%), transparent), 0 0 20px color-mix(in srgb, var(--c-cyan) var(--sidebar-glow-strength, 0%), transparent)"
            : undefined,
      }}
    >
      <div className="relative my-1 shrink-0">
        <div
          className="flex h-[46px] w-[46px] items-center justify-center rounded-[16px] transition-all duration-150 group-hover:brightness-110 group-hover:scale-[1.05]"
          style={{
            background: active ? LEGACY_COLORS.blue : "transparent",
            color: active ? LEGACY_COLORS.white : tab.color,
          }}
        >
          <Icon className={iconSizeClass} />
        </div>
      </div>
      <div
        className="min-w-0 overflow-hidden pl-2 text-left"
        style={{
          opacity: expanded ? 1 : 0,
          transform: expanded ? "translateX(0)" : "translateX(-6px)",
          transition: "opacity 180ms ease, transform 180ms ease",
          willChange: "transform, opacity",
          pointerEvents: expanded ? "auto" : "none",
          width: expanded ? "auto" : 0,
          maxWidth: expanded ? 200 : 0,
          paddingLeft: expanded ? undefined : 0,
        }}
      >
        <div className="truncate text-base font-bold text-left" style={{ color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.text }}>
          {tab.label}
        </div>
        <div className="truncate text-sm text-left" style={{ color: LEGACY_COLORS.muted2 }}>
          {tab.subtitle}
        </div>
      </div>
    </button>
  );
}
