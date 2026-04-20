"use client";

import Image from "next/image";
import type { ElementType } from "react";
import { ArrowUpRight, Boxes, Settings2, Warehouse } from "lucide-react";
import { LEGACY_COLORS } from "./legacyUi";

export type DesktopTabId = "inventory" | "warehouse" | "admin";

const TABS: { id: DesktopTabId; label: string; subtitle: string; icon: ElementType; accent: string }[] = [
  { id: "inventory", label: "재고", subtitle: "조회와 확인", icon: Boxes, accent: LEGACY_COLORS.blue },
  { id: "warehouse", label: "입출고 처리", subtitle: "창고와 부서 이동", icon: Warehouse, accent: LEGACY_COLORS.green },
  { id: "admin", label: "관리자", subtitle: "마스터와 설정", icon: Settings2, accent: LEGACY_COLORS.purple },
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
      className="flex h-screen w-[220px] shrink-0 flex-col border-r px-4 py-4"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      <div className="desktop-shell-subpanel mb-4 overflow-hidden px-4 py-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="overflow-hidden rounded-lg bg-white px-3 py-2 shadow-sm">
            <Image src="/dexcowin-logo.jpg" alt="DEXCOWIN" width={132} height={28} className="h-auto w-auto" priority />
          </div>
          <div
            className="rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.blue, background: LEGACY_COLORS.blueSoft }}
          >
            ERP
          </div>
        </div>
        <div className="text-xs leading-5" style={{ color: LEGACY_COLORS.textSoft }}>
          생산, 자재, 출하 흐름을 한 화면 안에서 빠르게 연결하는 데스크톱 워크스페이스
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
              className="group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border px-3 py-3 text-left transition"
              style={{
                background: active ? LEGACY_COLORS.blueSoft : LEGACY_COLORS.s1,
                borderColor: active ? LEGACY_COLORS.borderStrong : LEGACY_COLORS.border,
              }}
            >
              <span
                className="flex h-10 w-10 items-center justify-center rounded-lg transition"
                style={{
                  background: active ? tab.accent : LEGACY_COLORS.s2,
                  color: active ? "#fff" : LEGACY_COLORS.muted2,
                }}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold" style={{ color: active ? "#fff" : LEGACY_COLORS.text }}>
                  {tab.label}
                </span>
                <span className="mt-0.5 block text-xs" style={{ color: active ? LEGACY_COLORS.textSoft : LEGACY_COLORS.muted2 }}>
                  {tab.subtitle}
                </span>
              </span>
              <ArrowUpRight className="h-4 w-4 transition" style={{ color: active ? tab.accent : "transparent" }} />
            </button>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 pt-4">
        <div className="desktop-shell-subpanel px-4 py-4">
          <div className="desktop-section-label mb-2">Layout Mode</div>
          <div className="text-xs leading-5" style={{ color: LEGACY_COLORS.textSoft }}>
            모바일은 단순 조회를 유지하고, 데스크톱은 같은 기능을 더 빠른 작업 흐름으로 재구성합니다.
          </div>
        </div>

        <div className="rounded-xl border px-4 py-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: LEGACY_COLORS.green, boxShadow: `0 0 12px ${LEGACY_COLORS.green}` }} />
            <span className="desktop-section-label !tracking-[0.16em]">Workspace Ready</span>
          </div>
          <div className="text-xs leading-5" style={{ color: LEGACY_COLORS.textSoft }}>
            재고 확인, 이동 처리, 관리자 설정을 같은 시각 언어로 연결해 학습 비용을 줄입니다.
          </div>
        </div>
      </div>
    </aside>
  );
}
