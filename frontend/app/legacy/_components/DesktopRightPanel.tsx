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
      className="flex h-full min-h-0 w-[420px] shrink-0 flex-col overflow-hidden rounded-[32px] border px-5 py-5"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      <div className="mb-4 px-1 pb-4 border-b" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="truncate text-[22px] font-black">{title}</div>
        {subtitle ? (
          <div className="mt-1.5 text-sm leading-6" style={{ color: LEGACY_COLORS.muted2 }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}
