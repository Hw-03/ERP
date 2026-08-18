import { MapPin } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import type { IoLine } from "./types";

export function deductionSourceName(line: IoLine): string {
  if (line.from_bucket === "warehouse") return "창고";
  return line.from_department?.trim() || "조립";
}

export function deductionSourceSummary(lines: IoLine[]): string | null {
  const sourceNames = new Set(
    lines
      .filter(
        (line) =>
          line.included &&
          (line.from_bucket === "warehouse" || line.from_bucket === "production"),
      )
      .map(deductionSourceName),
  );

  if (sourceNames.size === 0) return null;
  if (sourceNames.size === 1) return sourceNames.values().next().value ?? null;
  return `${sourceNames.size}개 위치`;
}

export function IoDeductionSourceBadge({
  sourceName,
  variant = "badge",
}: {
  sourceName: string;
  variant?: "badge" | "field";
}) {
  if (variant === "field") {
    return (
      <span
        aria-label={`차감 위치: ${sourceName}`}
        className="inline-flex min-w-[112px] shrink-0 flex-col items-center gap-0.5"
      >
        <span
          className="text-xs font-bold uppercase tracking-[1.5px]"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          차감 위치
        </span>
        <span
          className="flex h-11 min-h-[44px] w-full items-center justify-center rounded-[10px] border px-3"
          style={{
            background: tint(LEGACY_COLORS.blue, 10),
            borderColor: tint(LEGACY_COLORS.blue, 30),
            color: LEGACY_COLORS.blue,
          }}
        >
          <span className="inline-flex -translate-x-1 items-center justify-center gap-1.5">
            <MapPin aria-hidden="true" className="h-4 w-4 shrink-0" />
            <strong
              className="whitespace-nowrap text-sm font-black"
              style={{ color: LEGACY_COLORS.text }}
            >
              {sourceName}
            </strong>
          </span>
        </span>
      </span>
    );
  }

  return (
    <span
      aria-label={`차감 위치: ${sourceName}`}
      className="inline-flex min-w-[112px] shrink-0 items-center justify-center gap-2 rounded-[12px] border px-3 py-2"
      style={{
        background: tint(LEGACY_COLORS.blue, 10),
        borderColor: tint(LEGACY_COLORS.blue, 30),
        color: LEGACY_COLORS.blue,
      }}
    >
      <MapPin aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="flex flex-col items-start leading-tight">
        <span className="text-xs font-bold">차감 위치</span>
        <strong className="text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
          {sourceName}
        </strong>
      </span>
    </span>
  );
}
