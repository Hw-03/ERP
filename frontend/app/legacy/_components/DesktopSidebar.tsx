"use client";

import Image from "next/image";
import type { ElementType } from "react";
import { Boxes, Settings2, Warehouse } from "lucide-react";
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
      style={{
        background: "var(--c-s1)",
        borderColor: "var(--c-border)",
        boxShadow: "var(--c-elev-1)",
      }}
    >
      <div
        className="mb-6 overflow-hidden rounded-xl bg-white px-2 py-1.5"
        style={{ boxShadow: "var(--c-elev-1)" }}
      >
        <Image src="/dexcowin-logo.png" alt="DEXCOWIN" width={150} height={34} className="h-auto w-full" priority />
      </div>

      <nav className="space-y-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all duration-200 ease-out"
              style={{
                background: active ? "var(--c-accent-soft)" : "transparent",
                border: `1px solid ${active ? "var(--c-accent-strong)" : "transparent"}`,
                boxShadow: active ? "var(--c-glow-blue)" : "none",
              }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 ease-out"
                style={{
                  background: active
                    ? "linear-gradient(135deg, var(--c-blue) 0%, color-mix(in srgb, var(--c-blue) 78%, #000 22%) 100%)"
                    : "var(--c-s2)",
                  color: active ? "#fff" : "var(--c-muted2)",
                  boxShadow: active ? "var(--c-elev-1), var(--c-inner-hl)" : "var(--c-inner-hl)",
                }}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div
                  className="text-sm font-bold tracking-[-0.01em]"
                  style={{ color: active ? "var(--c-blue)" : "var(--c-text)" }}
                >
                  {tab.label}
                </div>
                <div className="text-[11px]" style={{ color: "var(--c-muted2)" }}>
                  {tab.subtitle}
                </div>
              </div>
            </button>
          );
        })}
      </nav>

      <div
        className="mt-auto rounded-3xl p-4"
        style={{
          background: "var(--c-s2)",
          border: "1px solid var(--c-border)",
          boxShadow: "var(--c-inner-hl)",
        }}
      >
        <div
          className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: "var(--c-muted2)" }}
        >
          Layout Mode
        </div>
        <div className="text-sm leading-6" style={{ color: "var(--c-text)" }}>
          모바일에서는 재고 화면을 유지하고, PC에서는 같은 기능을 더 넓고 빠른 작업대로 전환합니다.
        </div>
      </div>
    </aside>
  );
}
