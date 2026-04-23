"use client";

import { useState } from "react";
import Image from "next/image";
import type { ElementType } from "react";
import { Boxes, History, Settings2, Warehouse } from "lucide-react";
import { LEGACY_COLORS } from "./legacyUi";

export type DesktopTabId = "inventory" | "warehouse" | "history" | "admin";

const TABS: { id: DesktopTabId; label: string; subtitle: string; icon: ElementType }[] = [
  { id: "inventory", label: "대시보드", subtitle: "현황과 안전재고 확인", icon: Boxes },
  { id: "warehouse", label: "입출고", subtitle: "입고와 출고 작업 처리", icon: Warehouse },
  { id: "history", label: "입출고 내역", subtitle: "입출고 이력 조회", icon: History },
  { id: "admin", label: "관리", subtitle: "마스터와 운영 설정", icon: Settings2 },
];

export function DesktopSidebar({
  activeTab,
  onTabChange,
}: {
  activeTab: DesktopTabId;
  onTabChange: (tab: DesktopTabId) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hoveredTab, setHoveredTab] = useState<DesktopTabId | null>(null);

  return (
    <div
      className="shrink-0 transition-[width] duration-300 ease-in-out"
      style={{ width: expanded ? 220 : 72 }}
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
        {/* 로고 */}
        <div className="flex h-12 items-center justify-center py-1">
          {/* 축소 상태: 작은 아이콘 */}
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[14px] transition-[opacity,transform] duration-200"
            style={{
              background: LEGACY_COLORS.s1,
              opacity: expanded ? 0 : 1,
              transform: expanded ? "scale(0.8)" : "scale(1)",
              pointerEvents: expanded ? "none" : "auto",
              position: expanded ? "absolute" : "relative",
            }}
          >
            <Image
              src="/dexcowin-logo.png"
              alt="DX"
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
              priority
            />
          </div>
          {/* 확장 상태: 큰 로고만 */}
          <div
            className="overflow-hidden transition-[opacity,transform] duration-200"
            style={{
              opacity: expanded ? 1 : 0,
              transform: expanded ? "translateX(0)" : "translateX(-8px)",
              pointerEvents: expanded ? "auto" : "none",
              position: expanded ? "relative" : "absolute",
            }}
          >
            <Image
              src="/dexcowin-logo.png"
              alt="DEXCOWIN"
              width={140}
              height={32}
              className="h-8 w-auto object-contain"
              priority
            />
          </div>
        </div>

        {/* 탭 내비게이션 */}
        <nav className="mt-5 space-y-1.5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                onMouseEnter={() => setHoveredTab(tab.id)}
                onMouseLeave={() => setHoveredTab(null)}
                className="group flex items-center justify-start rounded-[20px] -ml-1.5 w-[calc(100%+6px)] pl-1.5 transition-all duration-150 hover:scale-[1.015]"
                style={{
                  background: expanded
                    ? active
                      ? "linear-gradient(135deg, rgba(101,169,255,.16), rgba(78,201,245,.08))"
                      : hoveredTab === tab.id
                      ? "color-mix(in srgb, var(--c-cyan) var(--sidebar-hover-mix, 18%), transparent)"
                      : "transparent"
                    : "transparent",
                  boxShadow:
                    expanded && hoveredTab === tab.id && !active
                      ? "inset 0 0 0 1px color-mix(in srgb, var(--c-cyan) var(--sidebar-glow-strength, 0%), transparent), 0 0 20px color-mix(in srgb, var(--c-cyan) var(--sidebar-glow-strength, 0%), transparent)"
                      : undefined,
                }}
              >
                <div
                  className="my-1 flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[16px] transition-all duration-150 group-hover:brightness-110 group-hover:scale-[1.05]"
                  style={{
                    background: active ? LEGACY_COLORS.blue : LEGACY_COLORS.s2,
                    color: active ? "#fff" : LEGACY_COLORS.muted2,
                  }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div
                  className="min-w-0 overflow-hidden pl-2 text-left transition-[opacity,transform,width,max-width] duration-200"
                  style={{
                    opacity: expanded ? 1 : 0,
                    transform: expanded ? "translateX(0)" : "translateX(-6px)",
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
          })}
        </nav>
      </aside>
    </div>
  );
}
