"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Settings, Settings2 } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { SidebarMode } from "@/lib/sidebar-mode";
import type { DesktopTabId } from "./tabAccess";
export type { DesktopTabId } from "./tabAccess";

import { MAIN_TABS, type TabDef } from "./sidebarTabMeta";
export { DESKTOP_TAB_ICON_COLORS } from "./sidebarTabMeta";

const SIDEBAR_COLLAPSED_WIDTH = 72;
const SIDEBAR_EXPANDED_WIDTH = 220;

export function DesktopSidebar({
  activeTab,
  onTabChange,
  onOpenAdminPinEntry,
  visibleTabs,
  sidebarMode = "hover",
}: {
  activeTab: DesktopTabId;
  onTabChange: (tab: DesktopTabId) => void;
  onOpenAdminPinEntry?: () => void;
  visibleTabs: DesktopTabId[];
  sidebarMode?: SidebarMode;
}) {
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [hoveredTab, setHoveredTab] = useState<DesktopTabId | null>(null);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expanded = sidebarMode === "expanded" || (sidebarMode === "hover" && hoverExpanded);
  const sidebarWidth = expanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH;
  const canOpenAdmin = visibleTabs.includes("admin");

  const openSidebar = useCallback(() => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
    setHoverExpanded(true);
  }, []);

  const closeSidebarSoon = useCallback(() => {
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = setTimeout(() => {
      setHoverExpanded(false);
      setHoveredTab(null);
      collapseTimerRef.current = null;
    }, 220);
  }, []);

  useEffect(
    () => () => {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    },
    [],
  );

  return (
    <div
      className="shrink-0"
      style={{
        width: sidebarWidth,
        transition: "width 180ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <aside
        className="flex h-full w-full flex-col overflow-hidden rounded-[32px] border px-3 py-5"
        onMouseEnter={openSidebar}
        onMouseLeave={closeSidebarSoon}
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: LEGACY_COLORS.border,
          boxShadow: "none",
        }}
      >
        {/* 로고 */}
        <div
          className="flex items-center justify-center"
          style={{ height: expanded ? 68 : 44, transition: "height 180ms ease", flexShrink: 0 }}
        >
          {/* 축소 상태: 전체 로고 */}
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
          {/* 확장 상태: 큰 로고 */}
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

        {/* 주 내비게이션 */}
        <nav className="mt-5 space-y-1.5">
          {MAIN_TABS.filter((tab) => visibleTabs.includes(tab.id)).map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab}
              active={tab.id === activeTab}
              expanded={expanded}
              hovered={hoveredTab === tab.id}
              onTabChange={onTabChange}
              onKeepExpanded={openSidebar}
              onHover={setHoveredTab}
            />
          ))}
        </nav>

        {/* 하단 고정: 설정과 관리자 진입 */}
        <div className="mt-auto space-y-1.5 pt-1.5">
          <SettingsButton
            expanded={expanded}
            active={activeTab === "settings" || activeTab === "admin"}
            showAdminIcon={activeTab === "admin"}
            canOpenAdmin={canOpenAdmin}
            onClick={() => onTabChange("settings")}
            onOpenAdminPinEntry={onOpenAdminPinEntry}
          />
        </div>
      </aside>
    </div>
  );
}

function SettingsButton({
  expanded,
  active,
  showAdminIcon,
  canOpenAdmin,
  onClick,
  onOpenAdminPinEntry,
}: {
  expanded: boolean;
  active: boolean;
  showAdminIcon: boolean;
  canOpenAdmin: boolean;
  onClick: () => void;
  onOpenAdminPinEntry?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const Icon = showAdminIcon ? Settings2 : Settings;

  return (
    <button
      type="button"
      data-sidebar-tab
      aria-label="설정"
      title="설정"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      onContextMenu={(event) => {
        if (!canOpenAdmin || !onOpenAdminPinEntry) return;
        event.preventDefault();
        onOpenAdminPinEntry();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group flex items-center justify-start rounded-[20px] -mx-1.5 w-[calc(100%+12px)] pl-1.5 transition-all duration-150 hover:scale-[1.015]"
      style={{
        background: expanded
          ? active
            ? "linear-gradient(135deg, color-mix(in srgb, var(--c-blue) 14%, transparent), color-mix(in srgb, var(--c-cyan) 7%, transparent))"
            : hovered
              ? "color-mix(in srgb, var(--c-cyan) var(--sidebar-hover-mix, 18%), transparent)"
              : "transparent"
          : "transparent",
      }}
    >
      <div className="relative my-1 shrink-0">
        <div
          className="flex h-[46px] w-[46px] items-center justify-center rounded-[16px] transition-all duration-150 group-hover:brightness-110 group-hover:scale-[1.05]"
          style={{ background: active ? LEGACY_COLORS.blueSolid : "transparent", color: active ? LEGACY_COLORS.white : LEGACY_COLORS.cyan }}
        >
          <Icon className="h-5 w-5" />
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
        <div className="truncate text-left text-base font-bold" style={{ color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.text }}>
          설정
        </div>
        <div className="truncate text-left text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
          테마와 사이드바
        </div>
      </div>
    </button>
  );
}

function TabButton({
  tab,
  active,
  expanded,
  hovered,
  onTabChange,
  onKeepExpanded,
  onHover,
}: {
  tab: TabDef;
  active: boolean;
  expanded: boolean;
  hovered: boolean;
  onTabChange: (id: DesktopTabId) => void;
  onKeepExpanded: () => void;
  onHover: (id: DesktopTabId | null) => void;
}) {
  const Icon = tab.icon;
  const iconSizeClass = tab.id === "shipping" ? "h-[22px] w-[22px]" : "h-5 w-5";
  return (
    <button
      data-sidebar-tab
      onClick={() => {
        onKeepExpanded();
        onTabChange(tab.id);
      }}
      onMouseEnter={() => onHover(tab.id)}
      onMouseLeave={() => onHover(null)}
      aria-current={active ? "page" : undefined}
      className="group flex items-center justify-start rounded-[20px] -mx-1.5 w-[calc(100%+12px)] pl-1.5 transition-all duration-150 hover:scale-[1.015]"
      style={{
        background: expanded
          ? active
            ? "linear-gradient(135deg, color-mix(in srgb, var(--c-blue) 14%, transparent), color-mix(in srgb, var(--c-cyan) 7%, transparent))"
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
            background: active ? LEGACY_COLORS.blueSolid : "transparent",
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
