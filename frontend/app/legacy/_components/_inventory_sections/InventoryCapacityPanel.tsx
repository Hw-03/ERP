"use client";

import { AlertTriangle, Zap } from "lucide-react";
import type { ProductionCapacity } from "@/lib/api";
import { LEGACY_COLORS, formatNumber } from "../legacyUi";

export function InventoryCapacityPanel({ capacityData }: { capacityData: ProductionCapacity | null | undefined }) {
  if (!capacityData) return null;
  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-3 rounded-[14px] border px-4 py-2.5"
      style={{
        background: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 8%, transparent)`,
        borderColor: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 30%, transparent)`,
      }}
    >
      <Zap className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.cyan }} />
      <span className="text-sm font-semibold" style={{ color: LEGACY_COLORS.cyan }}>생산 가능</span>
      <span className="text-sm font-black" style={{ color: LEGACY_COLORS.cyan }}>
        {formatNumber(capacityData.immediate)}대
      </span>
      {capacityData.limiting_item && (
        <span
          className="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 16%, transparent)`,
            color: LEGACY_COLORS.yellow,
          }}
        >
          <AlertTriangle className="h-3 w-3" />
          병목 부품: {capacityData.limiting_item}
        </span>
      )}
    </div>
  );
}
