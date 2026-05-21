"use client";

import type { ElementType } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";

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

export function SidebarButton({
  entry,
  active,
  onClick,
  danger = false,
}: SidebarButtonProps) {
  const Icon = entry.icon;
  const tone = danger ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex w-full items-start gap-3 overflow-hidden rounded-[16px] border px-3 py-2.5 text-left transition-colors hover:brightness-[1.04]"
      style={{
        background: active
          ? `color-mix(in srgb, ${tone} ${danger ? 12 : 14}%, transparent)`
          : danger
            ? `color-mix(in srgb, ${LEGACY_COLORS.red} 4%, transparent)`
            : LEGACY_COLORS.s2,
        borderColor: active
          ? `color-mix(in srgb, ${tone} 55%, transparent)`
          : danger
            ? `color-mix(in srgb, ${LEGACY_COLORS.red} 22%, transparent)`
            : LEGACY_COLORS.border,
      }}
      aria-current={active ? "page" : undefined}
    >
      {/* active accent bar */}
      <span
        aria-hidden
        className="absolute inset-y-1.5 left-0 w-[3px] rounded-full transition-opacity"
        style={{
          background: tone,
          opacity: active ? 1 : 0,
        }}
      />
      <div
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px]"
        style={{
          background: active
            ? tone
            : danger
              ? `color-mix(in srgb, ${LEGACY_COLORS.red} 14%, transparent)`
              : LEGACY_COLORS.s1,
          color: active
            ? LEGACY_COLORS.white
            : danger
              ? LEGACY_COLORS.red
              : LEGACY_COLORS.muted2,
        }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="text-[14px] font-bold"
          style={{
            color: active
              ? danger
                ? LEGACY_COLORS.red
                : LEGACY_COLORS.text
              : danger
                ? LEGACY_COLORS.red
                : LEGACY_COLORS.text,
          }}
        >
          {entry.label}
        </div>
        <div
          className="mt-0.5 whitespace-normal text-[11px] leading-[1.35]"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          {entry.description}
        </div>
      </div>
    </button>
  );
}
