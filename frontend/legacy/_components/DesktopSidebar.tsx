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
      className="sticky top-0 flex h-screen shrink-0 flex-col border-r px-3 py-4"
      style={{ width: "200px", background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      <div className="mb-4 overflow-hidden rounded-xl bg-white px-2 py-1.5">
        <Image src="/dexcowin-logo.png" alt="DEXCOWIN" width={150} height={34} className="h-auto w-full" priority />
      </div>

      <nav className="flex-1 space-y-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left transition"
              style={{
                background: active ? "rgba(79,142,247,.16)" : "transparent",
                border: `1px solid ${active ? "rgba(79,142,247,.3)" : "transparent"}`,
              }}
            >
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{
                  background: active ? LEGACY_COLORS.blue : LEGACY_COLORS.s2,
                  color: active ? "#fff" : LEGACY_COLORS.muted2,
                }}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[13px] font-bold" style={{ color: active ? "#fff" : LEGACY_COLORS.text }}>
                  {tab.label}
                </div>
                <div className="text-[10px] leading-4" style={{ color: LEGACY_COLORS.muted2 }}>
                  {tab.subtitle}
                </div>
              </div>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto rounded-3xl p-3" style={{ background: LEGACY_COLORS.s2 }}>
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
