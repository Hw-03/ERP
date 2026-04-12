"use client";

import React from "react";

export type TabId = "inventory" | "warehouse" | "dept" | "history" | "admin";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "inventory", label: "재고", icon: "📦" },
  { id: "warehouse", label: "창고입출고", icon: "🏭" },
  { id: "dept", label: "부서입출고", icon: "🔄" },
  { id: "history", label: "히스토리", icon: "📋" },
  { id: "admin", label: "관리자", icon: "⚙️" },
];

export function LegacyLayout({
  activeTab,
  onTabChange,
  topContent,
  children,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  topContent?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative mx-auto flex min-h-screen max-w-[430px] flex-col bg-slate-950 text-slate-100">
      {/* Top bar */}
      <header className="fixed left-1/2 top-0 z-30 w-full max-w-[430px] -translate-x-1/2 border-b border-slate-800 bg-slate-950/95 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="text-base font-bold text-slate-100">X-Ray ERP</span>
          <span className="ml-auto rounded-full bg-slate-800 px-2.5 py-0.5 text-[10px] font-semibold text-blue-400">
            {TABS.find((t) => t.id === activeTab)?.label}
          </span>
        </div>
        {topContent && <div className="border-t border-slate-800">{topContent}</div>}
      </header>

      {/* Scrollable content */}
      <main
        className="flex-1 overflow-y-auto"
        style={{ paddingTop: topContent ? "96px" : "52px", paddingBottom: "72px" }}
      >
        {children}
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-1/2 z-30 w-full max-w-[430px] -translate-x-1/2 border-t border-slate-800 bg-slate-950/95 backdrop-blur-sm">
        <div className="flex">
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition ${
                  active ? "text-blue-400" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <span className="text-lg leading-none">{tab.icon}</span>
                <span className="leading-tight">{tab.label}</span>
                {active && (
                  <span className="mt-0.5 h-0.5 w-5 rounded-full bg-blue-400" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
