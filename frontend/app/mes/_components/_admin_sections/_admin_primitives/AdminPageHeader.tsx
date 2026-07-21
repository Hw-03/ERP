"use client";

import type { ElementType, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";

export interface AdminPageHeaderProps {
  icon: ElementType;
  title: string;
  description?: string;
  actions?: ReactNode;
  danger?: boolean;
}

export function AdminPageHeader({
  icon: Icon,
  title,
  description,
  actions,
  danger = false,
}: AdminPageHeaderProps) {
  const tone = danger ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <div
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]"
          style={{
            background: `color-mix(in srgb, ${tone} 14%, transparent)`,
            color: tone,
          }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2
              className="truncate text-[22px] font-black leading-tight"
              style={{ color: LEGACY_COLORS.text }}
            >
              {title}
            </h2>
            {danger && (
              <span
                className="flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-bold"
                style={{
                  background: `color-mix(in srgb, ${LEGACY_COLORS.red} 12%, transparent)`,
                  borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 35%, transparent)`,
                  color: LEGACY_COLORS.red,
                }}
              >
                <AlertTriangle className="h-3 w-3" />
                위험 영역
              </span>
            )}
          </div>
          {description && (
            <p
              className="mt-1 text-[14px] leading-snug"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
