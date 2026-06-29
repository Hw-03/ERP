"use client";

import { BarChart2, MapPinned, PackageCheck, type LucideIcon } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";

export type MobileMoreEntryId = "weekly" | "shipping" | "warehouseMap";

export function MobileMoreScreen({
  onWeekly,
  onShipping,
  onWarehouseMap,
  visibleEntries = ["weekly", "shipping", "warehouseMap"],
}: {
  onWeekly: () => void;
  onShipping: () => void;
  onWarehouseMap: () => void;
  visibleEntries?: MobileMoreEntryId[];
}) {
  return (
    <div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-6 pt-3">
      {visibleEntries.includes("weekly") && (
        <BigCard
          icon={BarChart2}
          label="주간보고"
          description="생산·재고 주간 흐름"
          accent={LEGACY_COLORS.blue}
          onClick={onWeekly}
        />
      )}
      {visibleEntries.includes("shipping") && (
        <BigCard
          icon={PackageCheck}
          label="출하"
          description="요청·준비·이력 조회"
          accent={LEGACY_COLORS.green}
          onClick={onShipping}
        />
      )}
      {visibleEntries.includes("warehouseMap") && (
        <BigCard
          icon={MapPinned}
          label="창고 지도"
          description="위치별 재고 조회"
          accent={LEGACY_COLORS.cyan}
          onClick={onWarehouseMap}
        />
      )}
    </div>
  );
}

function BigCard({
  icon: Icon,
  label,
  description,
  accent,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[96px] flex-1 items-center gap-5 rounded-[18px] border p-4 text-left transition-[transform] active:scale-[0.99]"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
    >
      <span
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[16px]"
        style={{ background: `color-mix(in srgb, ${accent} 20%, transparent)` }}
      >
        <Icon
          className="h-8 w-8"
          style={{ color: `color-mix(in srgb, ${accent} 42%, ${LEGACY_COLORS.text})` }}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xl font-black leading-tight">{label}</span>
        <span className="block text-sm font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
          {description}
        </span>
      </span>
    </button>
  );
}
