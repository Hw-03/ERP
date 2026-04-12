"use client";

import type { ElementType } from "react";
import { Boxes, Factory, PackagePlus, Settings2, Warehouse } from "lucide-react";
import { LEGACY_COLORS } from "./legacyUi";

export type DesktopTabId = "inventory" | "warehouse" | "dept" | "admin";

const TABS: { id: DesktopTabId; label: string; subtitle: string; icon: ElementType }[] = [
  { id: "inventory", label: "재고", subtitle: "Inventory", icon: Boxes },
  { id: "warehouse", label: "창고입출고", subtitle: "Warehouse", icon: Warehouse },
  { id: "dept", label: "부서입출고", subtitle: "Department", icon: PackagePlus },
  { id: "admin", label: "관리자", subtitle: "Admin", icon: Settings2 },
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
      className="flex h-full w-[250px] shrink-0 flex-col border-r px-5 py-6"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      <div className="mb-8 flex items-center gap-3">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: "rgba(79,142,247,.18)", color: LEGACY_COLORS.blue }}
        >
          <Factory className="h-6 w-6" />
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.22em]" style={{ color: LEGACY_COLORS.muted2 }}>
            Adaptive Workspace
          </div>
          <div className="text-lg font-black">X-Ray ERP</div>
        </div>
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
          같은 레거시 흐름을 유지하면서도 PC에서는 더 넓고 직관적인 작업대로 자동 전환됩니다.
        </div>
      </div>
    </aside>
  );
}
