"use client";

import Image from "next/image";
import type { ElementType } from "react";
import { Boxes, Settings2, Warehouse } from "lucide-react";
import { LEGACY_COLORS } from "./legacyUi";

export type DesktopTabId = "inventory" | "warehouse" | "admin";

const TABS: { id: DesktopTabId; label: string; subtitle: string; icon: ElementType }[] = [
  { id: "inventory", label: "재고", subtitle: "조회와 확인", icon: Boxes },
  { id: "warehouse", label: "입출고 처리", subtitle: "창고와 부서 통합", icon: Warehouse },
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
      className="sticky top-0 flex h-screen w-[250px] shrink-0 flex-col border-r px-5 py-6"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      <div className="mb-8 overflow-hidden rounded-[18px] bg-white px-2 py-2 shadow-[0_8px_24px_rgba(0,0,0,.24)]">
        <Image src="/dexcowin-logo.png" alt="DEXCOWIN" width={230} height={50} className="h-auto w-full" priority />
      </div>

      <nav className="space-y-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition"
              style={{
                background: active ? "rgba(79,142,247,.16)" : "transparent",
                border: `1px solid ${active ? "rgba(79,142,247,.3)" : "transparent"}`,
              }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{
                  background: active ? LEGACY_COLORS.blue : LEGACY_COLORS.s2,
                  color: active ? "#fff" : LEGACY_COLORS.muted2,
                }}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-bold" style={{ color: active ? "#fff" : LEGACY_COLORS.text }}>
                  {tab.label}
                </div>
                <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  {tab.subtitle}
                </div>
              </div>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto rounded-3xl p-4" style={{ background: LEGACY_COLORS.s2 }}>
        <div className="mb-1 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
          Layout Mode
        </div>
        <div className="text-sm leading-6" style={{ color: LEGACY_COLORS.text }}>
          모바일에서는 재고 화면을 유지하고, PC에서는 같은 기능을 더 넓고 빠른 작업대로 전환합니다.
        </div>
      </div>
    </aside>
  );
}
