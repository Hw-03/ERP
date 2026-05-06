"use client";

import type { Department, Item, ProductModel, ShipPackage } from "@/lib/api";
import { WarehouseStepLayout } from "./WarehouseStepLayout";
import type { WarehouseStepLayoutProps } from "./warehouseStepLayoutTypes";

/**
 * Round-13 (#21) 추출 — DesktopWarehouseView 의 compose 탭 영역.
 * Round-N: autoSave 텍스트 및 StickySummary 제거.
 */
export interface WarehouseComposeSectionProps extends Omit<WarehouseStepLayoutProps, "wizard"> {
  wizard: WarehouseStepLayoutProps["wizard"];
  error: string | null;
  setPendingDeptChange: (d: Department | null) => void;
}

// re-export common types for parent convenience
export type {
  Department,
  Item,
  ProductModel,
  ShipPackage,
};

export function WarehouseComposeSection({
  error,
  wizard,
  setPendingDeptChange,
  ...stepLayoutProps
}: WarehouseComposeSectionProps) {
  return (
    <>
      <WarehouseStepLayout
        {...stepLayoutProps}
        wizard={{
          ...wizard,
          changeSelectedDept: (d) => {
            if (wizard.step2Confirmed && d !== wizard.selectedDept) {
              setPendingDeptChange(d);
            } else {
              wizard.changeSelectedDept(d);
            }
          },
        }}
      />

      {error && (
        <div
          className="rounded-[14px] border px-4 py-3 text-sm"
          style={{
            background: `color-mix(in srgb, var(--c-red, #f87171) 10%, transparent)`,
            borderColor: `color-mix(in srgb, var(--c-red, #f87171) 30%, transparent)`,
            color: "var(--c-red, #f87171)",
          }}
        >
          {error}
        </div>
      )}
    </>
  );
}
