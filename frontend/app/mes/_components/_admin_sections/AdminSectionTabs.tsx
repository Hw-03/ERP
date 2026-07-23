"use client";

import type { ElementType } from "react";
import {
  Box,
  Building2,
  Download,
  FileArchive,
  Layers,
  Network,
  ShieldCheck,
  Users,
} from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { AdminSection } from "../_admin_hooks/useAdminViewState";

interface AdminSectionTab {
  id: AdminSection;
  label: string;
  icon: ElementType;
  danger?: boolean;
}

const SECTION_GROUPS: { label: string; tabs: AdminSectionTab[] }[] = [
  {
    label: "기준 정보",
    tabs: [
      { id: "models", label: "모델 관리", icon: Layers },
      { id: "items", label: "품목 관리", icon: Box },
      { id: "employees", label: "직원 관리", icon: Users },
      { id: "departments", label: "부서 관리", icon: Building2 },
    ],
  },
  {
    label: "구성 관리",
    tabs: [{ id: "bom", label: "BOM 관리", icon: Network }],
  },
  {
    label: "시스템",
    tabs: [
      { id: "export", label: "내보내기", icon: Download },
      { id: "audit", label: "외부 제출용 로그", icon: FileArchive },
      { id: "settings", label: "보안", icon: ShieldCheck, danger: true },
    ],
  },
];

interface AdminSectionTabsProps {
  section: AdminSection;
  onSelect: (next: AdminSection) => void;
}

export function AdminSectionTabs({ section, onSelect }: AdminSectionTabsProps) {
  return (
    <nav
      aria-label="관리자 섹션"
      className="flex shrink-0 items-center gap-3 overflow-x-auto rounded-[20px] border px-3 py-2"
      style={{
        background: LEGACY_COLORS.s1,
        borderColor: LEGACY_COLORS.border,
      }}
    >
      <div className="flex min-w-[880px] flex-1 items-center gap-2 lg:min-w-0">
        {SECTION_GROUPS.map((group, index) => (
          <div
            key={group.label}
            data-admin-tab-group
            role="group"
            aria-label={group.label}
            className={`flex min-w-0 flex-col gap-1 ${index > 0 ? "ml-2 border-l pl-4" : ""}`}
            style={{
              flexBasis: 0,
              flexGrow: group.tabs.length,
              ...(index > 0 ? { borderColor: LEGACY_COLORS.border } : {}),
            }}
          >
            <span
              className="pointer-events-none select-none text-[12px] font-black tracking-[0.08em]"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              {group.label}
            </span>
            <div className="flex items-center gap-1.5">
              {group.tabs.map((tab) => {
                const Icon = tab.icon;
                const active = section === tab.id;
                const tone = tab.danger ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onSelect(tab.id)}
                    aria-current={active ? "page" : undefined}
                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[12px] px-3 text-[14px] font-bold transition-colors hover:brightness-105 active:scale-[0.98]"
                    style={{
                      background: active
                        ? `color-mix(in srgb, ${tone} 14%, transparent)`
                        : "transparent",
                      color: active ? tone : LEGACY_COLORS.muted2,
                    }}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

    </nav>
  );
}
