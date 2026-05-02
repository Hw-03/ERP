"use client";

import type { ElementType } from "react";
import { LEGACY_COLORS } from "../legacyUi";

/**
 * SidebarButton 의 entry 형태.
 * AdminSection 종속을 끊기 위해 generic id (string) 로 단순화.
 * DesktopAdminView 의 SECTIONS / SETTINGS_ENTRY 와 시그니처 호환.
 */
export interface SidebarEntry {
  id: string;
  label: string;
  description: string;
  icon: ElementType;
}

export interface SidebarButtonProps {
  entry: SidebarEntry;
  active: boolean;
  onClick: () => void;
  danger?: boolean;
}

/**
 * DesktopAdminView 좌측 사이드바 버튼.
 * 동작/스타일 변화 0 — 본 라운드 분리 (R3-5).
 */
export function SidebarButton({
  entry,
  active,
  onClick,
  danger = false,
}: SidebarButtonProps) {
  const Icon = entry.icon;
  const tone = danger ? LEGACY_COLORS.red : LEGACY_COLORS.purple;
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[20px] border px-3 py-3 text-left transition-colors hover:bg-white/[0.12]"
      style={{
        background: active
          ? `color-mix(in srgb, ${tone} ${danger ? 14 : 16}%, transparent)`
          : danger
          ? `color-mix(in srgb, ${LEGACY_COLORS.red} 5%, transparent)`
          : LEGACY_COLORS.s2,
        borderColor: active
          ? tone
          : danger
          ? `color-mix(in srgb, ${LEGACY_COLORS.red} 30%, transparent)`
          : LEGACY_COLORS.border,
      }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px]"
        style={{
          background: active
            ? tone
            : danger
            ? `color-mix(in srgb, ${LEGACY_COLORS.red} 18%, transparent)`
            : LEGACY_COLORS.s1,
          color: active ? "#fff" : danger ? LEGACY_COLORS.red : LEGACY_COLORS.muted2,
        }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div
          className="text-base font-bold truncate"
          style={danger ? { color: LEGACY_COLORS.red } : undefined}
        >
          {entry.label}
        </div>
        <div className="mt-0.5 text-xs leading-4 truncate" style={{ color: LEGACY_COLORS.muted2 }}>
          {entry.description}
        </div>
      </div>
    </button>
  );
}
