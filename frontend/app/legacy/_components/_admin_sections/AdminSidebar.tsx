"use client";

import type { ElementType } from "react";
import {
  Box,
  Building2,
  Download,
  FileArchive,
  KeyRound,
  Layers,
  Lock,
  Network,
  PanelRight,
  ShieldCheck,
  Users,
} from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { SidebarButton } from "./SidebarButton";
import type { AdminSection } from "../_admin_hooks/useAdminViewState";

export interface SectionMeta {
  id: AdminSection;
  label: string;
  description: string;
  icon: ElementType;
}

export const SECTIONS: SectionMeta[] = [
  { id: "models", label: "모델 관리", description: "제품 모델 등록 및 사용 현황", icon: Layers },
  { id: "items", label: "품목 관리", description: "품목 기본 정보·재고·BOM 관리", icon: Box },
  { id: "employees", label: "직원 관리", description: "직원 활성·권한·PIN 관리", icon: Users },
  { id: "departments", label: "부서 관리", description: "부서 추가·색상·구성원 관리", icon: Building2 },
  { id: "bom", label: "BOM 관리", description: "부모-자식 자재 구성 편집", icon: Network },
  { id: "export", label: "내보내기", description: "엑셀 / CSV 데이터 내보내기", icon: Download },
  { id: "audit", label: "외부 제출용 로그", description: "심사 대비 월별 입출고 CSV", icon: FileArchive },
];

export const SETTINGS_ENTRY: SectionMeta = {
  id: "settings",
  label: "설정",
  description: "관리자 PIN, 데이터 초기화",
  icon: KeyRound,
};

const SECTION_GROUPS: { title: string; ids: AdminSection[] }[] = [
  { title: "기준 정보", ids: ["models", "items", "employees", "departments"] },
  { title: "구성 관리", ids: ["bom"] },
  { title: "시스템", ids: ["export", "audit"] },
];

interface Props {
  section: AdminSection;
  onSelect: (next: AdminSection) => void;
  onLock: () => void;
  showRightPanel?: boolean;
  onTogglePanel?: () => void;
}

export function AdminSidebar({ section, onSelect, onLock, showRightPanel, onTogglePanel }: Props) {
  return (
    <section
      className="flex min-h-0 flex-col overflow-hidden rounded-[20px] border p-4"
      style={{
        background: LEGACY_COLORS.s1,
        borderColor: LEGACY_COLORS.border,
        boxShadow: "var(--c-card-shadow)",
      }}
    >
      <div className="mb-4 shrink-0">
        <div
          className="text-[10px] font-bold uppercase tracking-[0.24em]"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          Admin Menu
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="text-[18px] font-black" style={{ color: LEGACY_COLORS.text }}>
            관리자 모드
          </div>
          <span
            className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.green} 14%, transparent)`,
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.green} 30%, transparent)`,
              color: LEGACY_COLORS.green,
            }}
          >
            <ShieldCheck className="h-3 w-3" />
            활성
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-0.5">
        {SECTION_GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-1.5">
            <div
              className="px-1 text-[10px] font-black uppercase tracking-[0.22em]"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              {group.title}
            </div>
            <div className="flex flex-col gap-1.5">
              {SECTIONS.filter((e) => group.ids.includes(e.id)).map((entry) => (
                <SidebarButton
                  key={entry.id}
                  entry={entry}
                  active={section === entry.id}
                  onClick={() => onSelect(entry.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div
        className="mt-3 flex shrink-0 flex-col gap-2 border-t pt-3"
        style={{ borderColor: LEGACY_COLORS.border }}
      >
        <SidebarButton
          entry={SETTINGS_ENTRY}
          active={section === SETTINGS_ENTRY.id}
          onClick={() => onSelect(SETTINGS_ENTRY.id)}
          danger
        />
        <div className="flex gap-2">
          {onTogglePanel && (
            <button
              type="button"
              onClick={onTogglePanel}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border transition-colors hover:brightness-[1.04]"
              style={{
                background: showRightPanel
                  ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
                  : LEGACY_COLORS.s2,
                borderColor: showRightPanel
                  ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 50%, transparent)`
                  : LEGACY_COLORS.border,
                color: showRightPanel ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
              }}
              title="요약 패널"
              aria-label="요약 패널 토글"
            >
              <PanelRight className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onLock}
            className="flex flex-1 items-center justify-center gap-2 rounded-[14px] border px-3 py-2.5 text-[12px] font-bold transition-colors hover:brightness-[1.04]"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.muted2,
            }}
          >
            <Lock className="h-3.5 w-3.5" />
            관리자 잠금
          </button>
        </div>
      </div>
    </section>
  );
}
