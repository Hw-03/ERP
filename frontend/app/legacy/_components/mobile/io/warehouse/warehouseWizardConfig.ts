"use client";

import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  PackageX,
  Undo2,
  type LucideIcon,
} from "lucide-react";

export type WarehouseMode = "wh2d" | "d2wh" | "whin" | "whout" | "whreturn";

/** 되돌릴 수 없는 작업 — Confirm 단계에서 빨간 경고 강조. */
export const CAUTION_WAREHOUSE_MODES: WarehouseMode[] = ["whreturn"];

export const WAREHOUSE_MODE_META: Record<
  WarehouseMode,
  { label: string; description: string; icon: LucideIcon; flow: { from: string; to: string } }
> = {
  wh2d: {
    label: "창고 → 생산부",
    description: "창고 재고를 생산부로 출고",
    icon: ArrowUpFromLine,
    flow: { from: "창고", to: "생산부" },
  },
  d2wh: {
    label: "생산부 → 창고",
    description: "생산부 재고를 창고로 반납",
    icon: ArrowRightLeft,
    flow: { from: "생산부", to: "창고" },
  },
  whin: {
    label: "공급업체 입고",
    description: "외부(공급업체)에서 창고로 입고",
    icon: ArrowDownToLine,
    flow: { from: "공급업체", to: "창고" },
  },
  whout: {
    label: "공급업체 출고",
    description: "창고에서 외부(공급업체)로 출고",
    icon: PackageX,
    flow: { from: "창고", to: "공급업체" },
  },
  whreturn: {
    label: "공급업체 반품",
    description: "창고 재고를 공급업체로 반품 (되돌릴 수 없음)",
    icon: Undo2,
    flow: { from: "창고", to: "공급업체(반품)" },
  },
};

export const WAREHOUSE_STEPS = [
  { key: "type", label: "유형" },
  { key: "items", label: "품목/수량" },
  { key: "confirm", label: "확인" },
] as const;

export const WAREHOUSE_STEP_COUNT = WAREHOUSE_STEPS.length;
