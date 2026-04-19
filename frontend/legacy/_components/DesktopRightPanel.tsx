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
      className="sticky top-6 flex h-[calc(100vh-156px)] min-h-0 shrink-0 flex-col overflow-hidden rounded-[32px] border px-4 py-4"
      style={{ width: "330px", background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      <div className="mb-3">
        <div className="truncate text-[19px] font-black">{title}</div>
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
