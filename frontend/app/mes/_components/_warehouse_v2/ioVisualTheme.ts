import type { CSSProperties } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import type { IoSubType } from "./types";

/** 작업 방향의 표시색이며, BOM 하위 라인의 실제 증감 색과는 독립적이다. */
export function ioDirectionTone(subType: IoSubType): string {
  switch (subType) {
    case "warehouse_to_dept":
    case "outbound_supplier":
    case "tube_outbound_supplier":
    case "internal_use_out":
    case "disassemble":
    case "adjust_out":
    case "warehouse_adjust_out":
    case "defect_quarantine":
    case "defect_restore":
    case "defect_process":
    case "supplier_return":
      return LEGACY_COLORS.red;
    default:
      return LEGACY_COLORS.blue;
  }
}

/** 선택 전에도 방향을 읽을 수 있도록 옅은 표면과 제목·포커스 색을 공유한다. */
export function ioSelectionStyle(tone: string, active: boolean): CSSProperties {
  return {
    background: tint(tone, active ? 8 : 4, LEGACY_COLORS.s1),
    borderColor: active ? tone : tint(tone, 25),
    borderWidth: active ? 2 : 1,
    color: tone,
    outlineColor: tone,
  };
}

/** 방향 미선택 시 중립 표면을 유지하고, 넓은 작업 패널에는 최소한의 색만 섞는다. */
export function ioSurfaceStyle(tone?: string): CSSProperties {
  return {
    backgroundColor: tone ? tint(tone, 3, LEGACY_COLORS.s1) : LEGACY_COLORS.s1,
    borderColor: tone ? tint(tone, 18, LEGACY_COLORS.border) : LEGACY_COLORS.border,
  };
}
