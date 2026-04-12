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
      className="flex h-full min-h-0 w-[340px] shrink-0 flex-col border-l px-4 py-4"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      <div className="mb-3">
        <div className="truncate text-[15px] font-black">{title}</div>
        {subtitle ? (
          <div className="mt-0.5 text-[10px] leading-4" style={{ color: LEGACY_COLORS.muted2 }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}
