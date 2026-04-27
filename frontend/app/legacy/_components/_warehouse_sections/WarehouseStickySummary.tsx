"use client";

import { LEGACY_COLORS } from "../legacyUi";

type Summary = { n: number; title: string; text: string };

export function WarehouseStickySummary({ summary }: { summary: Summary | null }) {
  if (!summary) return null;
  return (
    <div
      className="sticky top-0 z-10 flex items-center gap-3 rounded-[18px] border px-4 py-3 backdrop-blur-md"
      style={{
        background: `color-mix(in srgb, ${LEGACY_COLORS.s1} 92%, transparent)`,
        borderColor: LEGACY_COLORS.border,
      }}
    >
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black"
        style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.muted2 }}
      >
        {summary.n}
      </div>
      <div
        className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-[0.12em]"
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        {summary.title}
      </div>
      <div
        className="min-w-0 max-w-[60%] truncate text-sm font-bold"
        style={{ color: LEGACY_COLORS.text }}
      >
        {summary.text}
      </div>
    </div>
  );
}
