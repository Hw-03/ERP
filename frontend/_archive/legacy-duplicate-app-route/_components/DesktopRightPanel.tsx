"use client";

import { LEGACY_COLORS } from "./legacyUi";

export function DesktopRightPanel({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <aside
      className="desktop-shell-panel sticky top-6 flex h-[calc(100vh-156px)] min-h-0 w-[420px] shrink-0 flex-col overflow-hidden px-5 py-5"
      style={{
        background: `linear-gradient(180deg, ${LEGACY_COLORS.panel} 0%, ${LEGACY_COLORS.s1} 100%)`,
        borderColor: LEGACY_COLORS.border,
      }}
    >
      <div className="mb-4 border-b pb-4" style={{ borderColor: LEGACY_COLORS.border }}>
        {eyebrow ? (
          <div className="desktop-section-label mb-2">
            {eyebrow}
          </div>
        ) : null}
        <div className="truncate text-[22px] font-black leading-tight">{title}</div>
        {subtitle ? (
          <div className="mt-2 text-sm leading-6" style={{ color: LEGACY_COLORS.muted2 }}>
            {subtitle}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>

      {footer ? (
        <div className="mt-4 border-t pt-4" style={{ borderColor: LEGACY_COLORS.border }}>
          {footer}
        </div>
      ) : null}
    </aside>
  );
}
