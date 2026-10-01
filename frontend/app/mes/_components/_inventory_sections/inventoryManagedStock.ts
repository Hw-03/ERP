import type { CSSProperties } from "react";
import type { Item } from "@/lib/api";
import type { DefectManagementCategory } from "@/lib/api/types/defects";
import type { DefectiveStockBreakdown } from "@/lib/api/types/items";
import { LEGACY_COLORS } from "@/lib/mes/color";

export const STOCK_CATEGORY_ORDER: DefectManagementCategory[] = ["DEFECT", "B_GRADE", "OBSOLETE"];
const PATTERN_COLOR = `color-mix(in srgb, currentColor 75%, ${LEGACY_COLORS.s1})`;

/** 목록과 상세의 분류명·색을 맞추고, 막대에는 대비가 낮은 성긴 무늬를 쓴다. */
export const STOCK_CATEGORY_STYLES: Record<DefectManagementCategory, {
  label: string;
  color: string;
  pattern: CSSProperties;
}> = {
  DEFECT: {
    label: "불량",
    color: "#ef4444",
    pattern: {
      backgroundImage: `repeating-linear-gradient(135deg, ${PATTERN_COLOR} 0 2px, transparent 2px 12px)`,
    },
  },
  B_GRADE: {
    label: "B급",
    color: LEGACY_COLORS.stockBGrade,
    pattern: {
      backgroundImage: `radial-gradient(circle, ${PATTERN_COLOR} 0 1px, transparent 1.5px)`,
      backgroundSize: "10px 10px",
      backgroundPosition: "center",
    },
  },
  OBSOLETE: {
    label: "구형",
    color: LEGACY_COLORS.stockObsolete,
    pattern: {
      backgroundImage: `linear-gradient(to right, ${PATTERN_COLOR} 1px, transparent 1px), linear-gradient(to bottom, ${PATTERN_COLOR} 1px, transparent 1px)`,
      backgroundSize: "12px 12px",
      backgroundPosition: "center",
    },
  },
};

/** 새 집계를 우선하며, 이전 API의 격리 위치는 불량으로 호환한다. */
export function getManagedStockBreakdown(item: Item): DefectiveStockBreakdown[] {
  return (item.defective_breakdown ?? (item.locations ?? [])
    .filter((location) => location.status === "DEFECTIVE")
    .map((location) => ({
      department: location.department,
      management_category: "DEFECT" as const,
      quantity: Number(location.quantity),
    }))).filter((entry) => Number(entry.quantity) > 0);
}
