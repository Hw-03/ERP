import type { ReactElement } from "react";
import { IoLocationBadge } from "./IoLocationBadge";
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
}): ReactElement {
  return <IoLocationBadge label="차감 위치" value={sourceName} variant={variant} />;
}
