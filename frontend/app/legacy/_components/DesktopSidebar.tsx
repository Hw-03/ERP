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
      className="flex h-full w-[220px] shrink-0 flex-col border-r px-4 py-5"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      {/* Logo */}
      <div className="mb-5 flex items-center gap-2.5">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "rgba(79,142,247,.18)", color: LEGACY_COLORS.blue }}
        >
          <Factory className="h-5 w-5" />
        </div>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: LEGACY_COLORS.muted2 }}>
            X-Ray Manufacturing
          </div>
          <div className="text-[15px] font-black leading-tight">ERP</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="space-y-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition"
              style={{
                background: active ? "rgba(79,142,247,.16)" : "transparent",
                border: `1px solid ${active ? "rgba(79,142,247,.3)" : "transparent"}`,
              }}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{
                  background: active ? LEGACY_COLORS.blue : LEGACY_COLORS.s2,
                  color: active ? "#fff" : LEGACY_COLORS.muted2,
                }}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[13px] font-bold" style={{ color: active ? "#fff" : LEGACY_COLORS.text }}>
                  {tab.label}
                </div>
                <div className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  {tab.subtitle}
                </div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Bottom info */}
      <div className="mt-auto space-y-1 rounded-xl px-3 py-3" style={{ background: LEGACY_COLORS.s2 }}>
        <div className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: LEGACY_COLORS.green }} />
          <span className="text-[11px] font-semibold" style={{ color: LEGACY_COLORS.green }}>
            연결됨
          </span>
        </div>
        <div className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
          FastAPI · SQLite · 정밀 X-Ray 제조
        </div>
      </div>
    </aside>
  );
}
