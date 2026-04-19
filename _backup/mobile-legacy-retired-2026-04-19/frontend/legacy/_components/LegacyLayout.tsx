"use client";

import { AlertsBanner } from "./AlertsBanner";
import { LEGACY_COLORS } from "./legacyUi";

export type TabId = "inventory" | "warehouse" | "dept" | "queue" | "alerts" | "counts" | "admin";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "inventory", label: "재고", icon: "🏷" },
  { id: "warehouse", label: "창고", icon: "🏭" },
  { id: "dept", label: "부서", icon: "🔧" },
  { id: "queue", label: "Queue", icon: "🔁" },
  { id: "alerts", label: "알림", icon: "⚠️" },
  { id: "counts", label: "실사", icon: "📋" },
  { id: "admin", label: "관리자", icon: "🔐" },
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
    <div className="min-h-screen bg-black">
      <div
        className="mx-auto flex min-h-screen max-w-[430px] flex-col overflow-hidden"
        style={{
          background: LEGACY_COLORS.bg,
          color: LEGACY_COLORS.text,
          boxShadow: "0 0 60px rgba(0,0,0,.8)",
        }}
      >
        <div
          className="shrink-0"
          style={{ height: "env(safe-area-inset-top, 18px)", background: LEGACY_COLORS.s1 }}
        />

        <header
          className="shrink-0 border-b px-[18px] pb-3 pt-[10px]"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          <div
            className="mb-[3px] text-[10px] font-bold uppercase tracking-[2px]"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            {subtitle}
          </div>
          <div className="text-2xl font-black">{title}</div>
        </header>

        <main className="flex-1 overflow-y-auto px-[14px] py-[14px]">
          <div className="mb-3">
            <AlertsBanner />
          </div>
          {children}
        </main>

        <nav
          className="shrink-0 border-t px-0 pt-[6px]"
          style={{
            background: LEGACY_COLORS.s1,
            borderColor: LEGACY_COLORS.border,
            paddingBottom: "calc(env(safe-area-inset-bottom, 18px) + 6px)",
          }}
        >
          <div className="flex">
            {TABS.map((tab) => {
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className="flex flex-1 flex-col items-center gap-[3px] border-none bg-transparent px-1 py-1"
                >
                  <div className="text-[20px] leading-none">{tab.icon}</div>
                  <div
                    className="text-[9px] font-bold"
                    style={{ color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted }}
                  >
                    {tab.label}
                  </div>
                  <div
                    className="h-1 w-1 rounded-full"
                    style={{
                      background: LEGACY_COLORS.blue,
                      opacity: active ? 1 : 0,
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
