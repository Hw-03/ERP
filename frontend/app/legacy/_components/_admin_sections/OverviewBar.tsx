"use client";

import { useMemo } from "react";
import type {
  BOMDetailEntry,
  Employee,
  Item,
  ProductModel,
  ShipPackage,
} from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
export interface OverviewBarProps {
  items: Item[];
  employees: Employee[];
  productModels: ProductModel[];
  packages: ShipPackage[];
  allBomRows: BOMDetailEntry[];
}

/**
 * DesktopAdminView 상단 KPI 칩 줄.
 * 동작/스타일 변화 0 — 본 라운드 분리 (R3-5).
 */
export function OverviewBar({
  items,
  employees,
  productModels,
  packages,
  allBomRows,
}: OverviewBarProps) {
  const belowMin = useMemo(
    () =>
      items.filter(
        (i) => i.min_stock != null && Number(i.quantity) < Number(i.min_stock),
      ).length,
    [items],
  );
  const stats = useMemo(
    () => [
      { label: "품목", value: items.length, color: LEGACY_COLORS.blue },
      { label: "직원", value: employees.length, color: LEGACY_COLORS.green },
      { label: "모델", value: productModels.length, color: LEGACY_COLORS.purple },
      { label: "출하묶음", value: packages.length, color: LEGACY_COLORS.cyan },
      { label: "BOM 구성", value: allBomRows.length, color: LEGACY_COLORS.yellow },
      { label: "안전재고 미달", value: belowMin, color: LEGACY_COLORS.red },
    ],
    [items.length, employees.length, productModels.length, packages.length, allBomRows.length, belowMin],
  );
  return (
    <div
      className="mb-4 shrink-0 flex flex-wrap gap-2 rounded-[20px] border px-4 py-3"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      {stats.map(({ label, value, color }) => (
        <div
          key={label}
          className="flex items-center gap-1.5 rounded-[12px] px-3 py-1.5"
          style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}
        >
          <span className="text-sm font-black" style={{ color }}>{formatQty(value)}</span>
          <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{label}</span>
        </div>
      ))}
    </div>
  );
}
