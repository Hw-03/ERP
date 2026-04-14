"use client";

import { LEGACY_COLORS } from "./legacyUi";

export function DesktopRightPanel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <aside
      className="sticky top-6 flex h-[calc(100vh-156px)] min-h-0 w-[420px] shrink-0 flex-col overflow-hidden rounded-[28px] border px-5 py-5"
      style={{
        background: LEGACY_COLORS.s1,
        borderColor: LEGACY_COLORS.border,
        boxShadow: "var(--c-elev-3), var(--c-inner-hl)",
      }}
    >
      <div className="mb-4">
        <div className="truncate text-[20px] font-bold tracking-[-0.02em]">{title}</div>
        {subtitle ? (
          <div className="mt-1 text-xs leading-5" style={{ color: LEGACY_COLORS.muted2 }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}
