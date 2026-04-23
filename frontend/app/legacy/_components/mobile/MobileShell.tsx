"use client";

import { useState } from "react";
import { Bell, Lock, Package, Warehouse, Wrench, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { LEGACY_COLORS } from "../legacyUi";
import { TYPO } from "./tokens";
import { AlertsSheet } from "./AlertsSheet";
import { IconButton } from "./primitives";

export type TabId = "inventory" | "warehouse" | "dept" | "admin";

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "inventory", label: "재고", icon: Package },
  { id: "warehouse", label: "창고입출고", icon: Warehouse },
  { id: "dept", label: "부서입출고", icon: Wrench },
  { id: "admin", label: "관리자", icon: Lock },
];

export function MobileShell({
  activeTab,
  onTabChange,
  title,
  subtitle,
  headerRight,
  children,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  title: string;
  subtitle: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [alertsOpen, setAlertsOpen] = useState(false);

  return (
    <div className="h-screen overflow-hidden bg-black">
      <div
        className="mx-auto flex h-full max-w-[430px] flex-col overflow-hidden"
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
          className="flex shrink-0 items-end justify-between border-b px-5 pb-3 pt-2"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          <div className="min-w-0 flex-1">
            <div
              className={clsx(TYPO.caption, "font-bold uppercase tracking-[2px]")}
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              {subtitle}
            </div>
            <div className="text-xl font-black leading-tight" style={{ color: LEGACY_COLORS.text }}>
              {title}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {headerRight}
            <IconButton icon={Bell} label="알림" size="md" onClick={() => setAlertsOpen(true)} />
          </div>
        </header>

        <main className="relative flex-1 overflow-y-auto">{children}</main>

        <nav
          className="shrink-0 border-t"
          style={{
            background: LEGACY_COLORS.s1,
            borderColor: LEGACY_COLORS.border,
            paddingBottom: "calc(env(safe-area-inset-bottom, 10px))",
          }}
        >
          <div className="flex">
            {TABS.map((tab) => {
              const active = tab.id === activeTab;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className="flex flex-1 flex-col items-center gap-1 px-1 py-2 transition-colors active:bg-white/[0.08]"
                  aria-label={tab.label}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon
                    size={20}
                    strokeWidth={active ? 2 : 1.75}
                    color={active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted}
                  />
                  <div
                    className={clsx(TYPO.caption, "font-semibold")}
                    style={{ color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted }}
                  >
                    {tab.label}
                  </div>
                  <div
                    className="h-[3px] w-6 rounded-full"
                    style={{ background: active ? LEGACY_COLORS.blue : "transparent" }}
                  />
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      <AlertsSheet open={alertsOpen} onClose={() => setAlertsOpen(false)} />
    </div>
  );
}
