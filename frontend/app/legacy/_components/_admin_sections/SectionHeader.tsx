"use client";

import type { ElementType } from "react";
import { AlertTriangle } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";

export interface SectionHeaderProps {
  icon: ElementType;
  label: string;
  description: string;
  danger?: boolean;
}

/**
 * DesktopAdminView 우측 영역 헤더.
 * 동작/스타일 변화 0 — 본 라운드 분리 (R3-5).
 */
export function SectionHeader({
  icon: Icon,
  label,
  description,
  danger = false,
}: SectionHeaderProps) {
  return (
    <div className="mb-4 shrink-0">
      <div className="text-sm font-bold uppercase tracking-[0.22em]" style={{ color: LEGACY_COLORS.muted2 }}>
        Workspace
      </div>
      <div className="mt-1 flex items-center gap-2">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-[14px]"
          style={{
            background: danger
              ? `color-mix(in srgb, ${LEGACY_COLORS.red} 14%, transparent)`
              : `color-mix(in srgb, ${LEGACY_COLORS.purple} 14%, transparent)`,
            color: danger ? LEGACY_COLORS.red : LEGACY_COLORS.purple,
          }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-2xl font-black">{label} 관리</div>
        {danger && (
          <span
            className="ml-1 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.red} 14%, transparent)`,
              color: LEGACY_COLORS.red,
            }}
          >
            <AlertTriangle className="h-3 w-3" />
            위험 영역
          </span>
        )}
      </div>
      <div className="mt-1 text-base" style={{ color: LEGACY_COLORS.muted2 }}>
        {description}
      </div>
    </div>
  );
}
