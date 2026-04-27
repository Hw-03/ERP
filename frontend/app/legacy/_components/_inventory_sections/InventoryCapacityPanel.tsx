"use client";

import { AlertTriangle, Zap } from "lucide-react";
import type { ProductionCapacity } from "@/lib/api";
import { LEGACY_COLORS, formatNumber } from "../legacyUi";

export function InventoryCapacityPanel({
  capacityData,
  onClick,
}: {
  capacityData: ProductionCapacity | null | undefined;
  onClick?: () => void;
}) {
  if (!capacityData) return null;
  const interactive = typeof onClick === "function";
  const baseStyle = {
    background: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 8%, transparent)`,
    borderColor: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 30%, transparent)`,
  };
  const className =
    "mt-3 flex w-full flex-wrap items-center gap-3 rounded-[14px] border px-4 py-2.5 text-left" +
    (interactive ? " cursor-pointer transition-opacity hover:opacity-90" : "");
  const inner = (
    <>
      <Zap className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.cyan }} />
      <span className="text-sm font-semibold" style={{ color: LEGACY_COLORS.cyan }}>생산 가능</span>
      {capacityData.immediate === 0 && capacityData.maximum === 0 ? (
        <span className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>미등록</span>
      ) : (
        <>
          <span className="text-sm font-black" style={{ color: LEGACY_COLORS.cyan }}>
            즉시 {formatNumber(capacityData.immediate)}
          </span>
          <span className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>/</span>
          <span className="text-sm font-black" style={{ color: LEGACY_COLORS.blue }}>
            최대 {formatNumber(capacityData.maximum)}
          </span>
        </>
      )}
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
    </>
  );
  if (interactive) {
    return (
      <button type="button" className={className} style={baseStyle} onClick={onClick} title="생산 가능수량 상세">
        {inner}
      </button>
    );
  }
  return (
    <div className={className} style={baseStyle}>
      {inner}
    </div>
  );
}
