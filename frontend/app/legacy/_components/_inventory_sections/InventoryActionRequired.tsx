"use client";

import { AlertTriangle, ArrowRight } from "lucide-react";
import { LEGACY_COLORS, formatNumber } from "../legacyUi";

type Props = {
  lowCount: number;
  zeroCount: number;
  onGoToWarehouseTab?: () => void;
};

export function InventoryActionRequired({ lowCount, zeroCount, onGoToWarehouseTab }: Props) {
  const total = lowCount + zeroCount;
  if (total === 0) return null;
  const tone = zeroCount > 0 ? LEGACY_COLORS.red : LEGACY_COLORS.yellow;
  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-3 rounded-[14px] border px-4 py-2.5"
      style={{
        background: `color-mix(in srgb, ${tone} 10%, transparent)`,
        borderColor: `color-mix(in srgb, ${tone} 40%, transparent)`,
      }}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: tone }} />
      <span className="text-sm font-bold" style={{ color: tone }}>
        조치 필요
      </span>
      <span className="text-sm font-semibold" style={{ color: LEGACY_COLORS.text }}>
        부족 {formatNumber(lowCount)}건 · 품절 {formatNumber(zeroCount)}건
      </span>
      {onGoToWarehouseTab && (
        <button
          onClick={onGoToWarehouseTab}
          className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: tone }}
        >
          입출고 화면 열기 <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
