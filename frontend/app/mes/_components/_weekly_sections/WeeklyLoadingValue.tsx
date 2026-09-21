import type { ReactNode } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";

/** Keep the surrounding text line height while reserving an unknown value. */
export function WeeklyLoadingValue({ loading = false, children, width = "2ch" }: { loading?: boolean; children?: ReactNode; width?: string }) {
  if (!loading) return <>{children}</>;
  return (
    <span aria-hidden="true" data-weekly-loading-value className="relative inline-block align-baseline" style={{ width }}>
      <span className="invisible">0</span>
      <span className="absolute inset-x-0 top-1/2 h-[0.7em] -translate-y-1/2 rounded-[4px] motion-safe:animate-pulse" style={{ background: LEGACY_COLORS.s3 }} />
    </span>
  );
}
