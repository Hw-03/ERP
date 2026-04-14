"use client";

import type { ElementType } from "react";
import { Boxes, ShieldCheck, Warehouse, Wrench } from "lucide-react";
import { LEGACY_COLORS } from "./legacyUi";

export type TabId = "inventory" | "warehouse" | "dept" | "admin";

const TABS: { id: TabId; label: string; icon: ElementType }[] = [
  { id: "inventory", label: "재고", icon: Boxes },
  { id: "warehouse", label: "창고입출고", icon: Warehouse },
  { id: "dept", label: "부서입출고", icon: Wrench },
  { id: "admin", label: "관리자", icon: ShieldCheck },
];

export function LegacyLayout({
  activeTab,
  onTabChange,
  subtitle,
  title,
  children,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  subtitle: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen" style={{ background: LEGACY_COLORS.bg }}>
      <div
        className="mx-auto flex min-h-screen max-w-[430px] flex-col overflow-hidden"
        style={{
          background: LEGACY_COLORS.bg,
          color: LEGACY_COLORS.text,
          boxShadow: "var(--c-elev-3)",
        }}
      >
        <div
          className="shrink-0"
          style={{ height: "env(safe-area-inset-top, 18px)", background: LEGACY_COLORS.s1 }}
        />

        <header
          className="shrink-0 border-b px-[18px] pb-3 pt-[10px]"
          style={{
            background: LEGACY_COLORS.s1,
            borderColor: LEGACY_COLORS.border,
            boxShadow: "var(--c-elev-1)",
          }}
        >
          <div
            className="mb-[3px] text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            {subtitle}
          </div>
          <div className="text-2xl font-bold tracking-[-0.02em]">{title}</div>
        </header>

        <main className="flex-1 overflow-y-auto px-[14px] py-[14px]">{children}</main>

        <nav
          className="shrink-0 border-t px-0 pt-[6px]"
          style={{
            background: LEGACY_COLORS.s1,
            borderColor: LEGACY_COLORS.border,
            paddingBottom: "calc(env(safe-area-inset-bottom, 18px) + 6px)",
            boxShadow: "0 -8px 24px -16px rgba(0,0,0,.35)",
          }}
        >
          <div className="flex">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className="flex flex-1 flex-col items-center gap-[3px] border-none bg-transparent px-1 py-1 transition-all duration-200 ease-out"
                >
                  <Icon
                    className="h-[20px] w-[20px] transition-all duration-200 ease-out"
                    strokeWidth={active ? 2.4 : 1.8}
                    style={{ color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted }}
                  />
                  <div
                    className="text-[9px] font-bold tracking-[-0.005em]"
                    style={{ color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted }}
                  >
                    {tab.label}
                  </div>
                  <div
                    className="h-1 w-1 rounded-full transition-opacity duration-200 ease-out"
                    style={{
                      background: LEGACY_COLORS.blue,
                      opacity: active ? 1 : 0,
                      boxShadow: active ? `0 0 8px ${LEGACY_COLORS.blue}` : "none",
                    }}
                  />
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
