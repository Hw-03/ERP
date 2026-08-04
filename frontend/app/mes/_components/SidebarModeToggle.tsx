"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ElementType } from "react";
import { PanelLeftClose, PanelLeftDashed, PanelLeftOpen } from "lucide-react";
import { api } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { normalizeSidebarMode, type SidebarMode } from "@/lib/sidebar-mode";
import {
  readCurrentOperator,
  updateCurrentOperatorPreferences,
  useCurrentOperator,
} from "./login/useCurrentOperator";

const SIDEBAR_MODE_STORAGE_KEY = "dexcowin_mes_sidebar_mode";

const MODE_PRESENTATION: Record<
  SidebarMode,
  { label: string; next: SidebarMode; icon: ElementType }
> = {
  hover: { label: "호버 모드", next: "collapsed", icon: PanelLeftDashed },
  collapsed: { label: "접힘 고정", next: "expanded", icon: PanelLeftClose },
  expanded: { label: "펼침 고정", next: "hover", icon: PanelLeftOpen },
};

export function useSidebarMode(): {
  mode: SidebarMode;
  cycleMode: () => void;
} {
  const operator = useCurrentOperator();
  const [mode, setMode] = useState<SidebarMode>("hover");
  const modeRef = useRef<SidebarMode>("hover");
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const currentOperator = operator ?? readCurrentOperator();
    const nextMode = currentOperator
      ? normalizeSidebarMode(currentOperator.sidebar_mode) ?? "hover"
      : normalizeSidebarMode(window.localStorage.getItem(SIDEBAR_MODE_STORAGE_KEY)) ?? "hover";
    modeRef.current = nextMode;
    setMode(nextMode);
  }, [operator]);

  const cycleMode = useCallback(() => {
    const nextMode = MODE_PRESENTATION[modeRef.current].next;
    modeRef.current = nextMode;
    setMode(nextMode);
    window.localStorage.setItem(SIDEBAR_MODE_STORAGE_KEY, nextMode);

    const currentOperator = operator ?? readCurrentOperator();
    if (!currentOperator) return;

    updateCurrentOperatorPreferences({ sidebar_mode: nextMode });
    saveQueueRef.current = saveQueueRef.current
      .then(() => api.setEmployeeSidebarMode(currentOperator.employee_id, nextMode))
      .then(() => undefined)
      .catch(() => undefined);
  }, [operator]);

  return { mode, cycleMode };
}

export function SidebarModeToggle({
  expanded = false,
  mode,
  onCycle,
}: {
  expanded?: boolean;
  mode: SidebarMode;
  onCycle: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const current = MODE_PRESENTATION[mode];
  const nextLabel = MODE_PRESENTATION[current.next].label;
  const Icon = current.icon;
  const accessibleLabel = `사이드바 현재 ${current.label}. 클릭하면 ${nextLabel}`;

  return (
    <button
      type="button"
      onClick={onCycle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={accessibleLabel}
      title={accessibleLabel}
      className="group flex items-center justify-start rounded-[20px] -mx-1.5 w-[calc(100%+12px)] pl-1.5 transition-all duration-150 hover:scale-[1.015]"
      style={{
        background:
          expanded && hovered
            ? "color-mix(in srgb, var(--c-cyan) var(--sidebar-hover-mix, 18%), transparent)"
            : "transparent",
      }}
    >
      <div className="relative my-1 shrink-0">
        <div
          className="flex h-[46px] w-[46px] items-center justify-center rounded-[16px] transition-all duration-150 group-hover:brightness-110 group-hover:scale-[1.05]"
          style={{ color: LEGACY_COLORS.cyan }}
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
        <div className="truncate text-left text-base font-bold" style={{ color: LEGACY_COLORS.text }}>
          {current.label}
        </div>
        <div className="truncate text-left text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
          클릭하면 {nextLabel}
        </div>
      </div>
    </button>
  );
}
