"use client";

import { X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";

export function DesktopRightPanel({
  title,
  subtitle,
  headerBadge,
  backButton,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  headerBadge?: React.ReactNode;
  backButton?: React.ReactNode;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  return (
    <aside
      className="flex h-full min-h-0 w-[420px] shrink-0 flex-col overflow-hidden rounded-[32px] border px-5 py-5"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      {/* 상단 버튼 바 — 항상 고정 높이. 뒤로(좌) · X(우) */}
      <div className="mb-3 flex min-h-[28px] items-center justify-between">
        <div>{backButton ?? null}</div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="패널 닫기"
            className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:brightness-110"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.red} 15%, transparent)`,
              color: LEGACY_COLORS.red,
            }}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mb-4 px-1 pb-4 border-b" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="line-clamp-2 text-[22px] font-black">{title}</div>
            {subtitle ? (
              <div className="mt-1.5 text-sm leading-6" style={{ color: LEGACY_COLORS.muted2 }}>
                {subtitle}
              </div>
            ) : null}
          </div>
          {headerBadge ? <div className="shrink-0 pt-1">{headerBadge}</div> : null}
        </div>
      </div>
      <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}
