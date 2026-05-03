"use client";

import type { ElementType } from "react";
import {
  Building2,
  FileDown,
  KeyRound,
  Layers,
  PackagePlus,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { SidebarButton } from "./SidebarButton";
import type { AdminSection } from "../_admin_hooks/useAdminViewState";

/**
 * 관리자 좌측 사이드바.
 *
 * Round-10B (#1) 추출. DesktopAdminView 본문에 박혀 있던 사이드바 영역
 * (그룹 라벨 + SidebarButton 7개 + 설정/잠금) 을 그대로 들고 나왔다.
 *
 * 시각/JSX 구조 변경 0 — 기존 className/style/aria 프로퍼티 모두 보존.
 */

export interface SectionMeta {
  id: AdminSection;
  label: string;
  description: string;
  icon: ElementType;
}

export const SECTIONS: SectionMeta[] = [
  { id: "models", label: "모델", description: "제품 모델 추가/삭제", icon: Layers },
  { id: "items", label: "품목", description: "품목 기본 정보 수정", icon: PackagePlus },
  { id: "employees", label: "직원", description: "직원 활성 상태 관리", icon: Users },
  { id: "departments", label: "부서", description: "부서 추가/비활성화", icon: Building2 },
  { id: "bom", label: "BOM", description: "부모-자식 자재 구성", icon: Settings2 },
  { id: "packages", label: "출하묶음", description: "패키지 구성 관리", icon: ShieldCheck },
  { id: "export", label: "내보내기", description: "엑셀 데이터 내보내기", icon: FileDown },
];

export const SETTINGS_ENTRY: SectionMeta = {
  id: "settings",
  label: "설정",
  description: "PIN, CSV, 초기화",
  icon: KeyRound,
};

const SECTION_GROUPS: { title: string; ids: AdminSection[] }[] = [
  { title: "기준정보", ids: ["models", "items", "employees", "departments"] },
  { title: "구성관리", ids: ["bom", "packages"] },
  { title: "시스템", ids: ["export"] },
];

interface Props {
  section: AdminSection;
  onSelect: (next: AdminSection) => void;
  onLock: () => void;
}

export function AdminSidebar({ section, onSelect, onLock }: Props) {
  return (
    <section className="card flex min-h-0 flex-col overflow-hidden">
      <div className="mb-3 shrink-0">
        <div className="text-sm font-bold uppercase tracking-[0.22em]" style={{ color: LEGACY_COLORS.muted2 }}>
          Admin Menu
        </div>
        <div className="mt-1 flex items-center gap-2 text-xl font-black">
          관리자 모드
          <span
            className="ml-1 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.green} 14%, transparent)`,
              color: LEGACY_COLORS.green,
            }}
          >
            <ShieldCheck className="h-3 w-3" />
            활성
          </span>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {SECTION_GROUPS.map((group) => (
          <div key={group.title}>
            <div
              className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.24em]"
              style={{ color: LEGACY_COLORS.purple, opacity: 0.8 }}
            >
              {group.title}
            </div>
            <div className="flex flex-col gap-2">
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
      <div className="mt-3 shrink-0 flex flex-col gap-2">
        <SidebarButton
          entry={SETTINGS_ENTRY}
          active={section === SETTINGS_ENTRY.id}
          onClick={() => onSelect(SETTINGS_ENTRY.id)}
          danger
        />
        <button
          onClick={onLock}
          className="w-full rounded-[16px] border px-3 py-2.5 text-xs font-semibold transition-colors hover:bg-white/10"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
        >
          관리자 잠금
        </button>
      </div>
    </section>
  );
}
