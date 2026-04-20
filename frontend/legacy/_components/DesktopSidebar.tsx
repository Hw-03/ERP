"use client";

import Image from "next/image";
import type { ElementType } from "react";
import { Boxes, Settings2, Warehouse } from "lucide-react";
import { LEGACY_COLORS } from "./legacyUi";

export type DesktopTabId = "inventory" | "warehouse" | "admin";

const TABS: { id: DesktopTabId; label: string; subtitle: string; icon: ElementType }[] = [
  { id: "inventory", label: "재고", subtitle: "조회와 확인", icon: Boxes },
  { id: "warehouse", label: "입출고 처리", subtitle: "입고와 출고 등록", icon: Warehouse },
  { id: "admin", label: "관리자", subtitle: "마스터와 설정", icon: Settings2 },
];

export function DesktopSidebar({
  activeTab,
  onTabChange,
}: {
  activeTab: DesktopTabId;
  onTabChange: (tab: DesktopTabId) => void;
}) {
  return (
    <aside
      className="flex h-screen w-[162px] shrink-0 flex-col border-r px-4 py-4"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      <div
        className="mb-4 flex items-center justify-center rounded-full border px-3 py-2"
        style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
      >
        <div className="overflow-hidden rounded-md bg-white px-3 py-1.5 shadow-sm">
          <Image src="/dexcowin-logo.jpg" alt="DEXCOWIN" width={112} height={22} className="h-auto w-auto" priority />
        </div>
      </div>

      <nav className="space-y-3">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === activeTab;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className="flex w-full items-center gap-3 rounded-[14px] border px-4 py-4 text-left transition"
              style={{
                background: active ? LEGACY_COLORS.blue : "transparent",
                borderColor: active ? LEGACY_COLORS.blue : "transparent",
                color: LEGACY_COLORS.text,
              }}
            >
              <span
                className="flex h-10 w-10 items-center justify-center rounded-md"
                style={{
                  background: active ? "rgba(255,255,255,0.08)" : "transparent",
                  color: active ? "#fff" : LEGACY_COLORS.muted2,
                }}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold">{tab.label}</span>
                <span
                  className="mt-0.5 block text-xs leading-5"
                  style={{ color: active ? "rgba(255,255,255,0.82)" : LEGACY_COLORS.muted2 }}
                >
                  {tab.subtitle}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto border-t px-1 pt-5" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="desktop-section-label mb-3">Layout Mode</div>
        <div className="text-sm leading-7" style={{ color: LEGACY_COLORS.textSoft }}>
          모바일에서는 재고 화면을 유지하고, PC에서는 같은 기능을 더 빠른 작업 형태로 전환합니다.
        </div>
      </div>
    </aside>
  );
}
