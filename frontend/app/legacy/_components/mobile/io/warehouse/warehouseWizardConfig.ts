"use client";

import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, type LucideIcon } from "lucide-react";

export type WarehouseMode = "wh2d" | "d2wh" | "whin";

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
    label: "창고 입고",
    description: "외부(공급업체)에서 창고로 입고",
    icon: ArrowDownToLine,
    flow: { from: "외부", to: "창고" },
  },
};

export const WAREHOUSE_STEPS = [
  { key: "type", label: "유형" },
  { key: "items", label: "품목/수량" },
  { key: "confirm", label: "확인" },
] as const;

export const WAREHOUSE_STEP_COUNT = WAREHOUSE_STEPS.length;
