"use client";

import type { Department, Item, ProductModel, ShipPackage } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { WarehouseStickySummary } from "./WarehouseStickySummary";
import { WarehouseStepLayout } from "./WarehouseStepLayout";
import type { WarehouseStepLayoutProps } from "./warehouseStepLayoutTypes";

const AUTO_SAVE_LABEL: Record<"idle" | "saving" | "saved" | "error", string> = {
  idle: "",
  saving: "작업 저장 중...",
  saved: "작업 내용 저장됨",
  error: "작업 저장 실패",
};

/**
 * Round-13 (#21) 추출 — DesktopWarehouseView 의 compose 탭 영역 (autoSave + sticky + StepLayout + error).
 *
 * `WarehouseStepLayoutProps` 의 모든 props 를 그대로 전달 + autoSaveStatus + stickySummary + error.
 * 부모는 sectionTab === "compose" 일 때만 본 컴포넌트 렌더.
 */
export interface WarehouseComposeSectionProps extends Omit<WarehouseStepLayoutProps, "wizard"> {
  wizard: WarehouseStepLayoutProps["wizard"];
  autoSaveStatus: "idle" | "saving" | "saved" | "error";
  stickySummary: { n: number; title: string; text: string } | null;
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
  autoSaveStatus,
  stickySummary,
  error,
  wizard,
  setPendingDeptChange,
  ...stepLayoutProps
}: WarehouseComposeSectionProps) {
  return (
    <>
      {autoSaveStatus !== "idle" && (
        <div
          className="self-end text-xs"
          style={{
            color:
              autoSaveStatus === "error"
                ? LEGACY_COLORS.red
                : autoSaveStatus === "saving"
                  ? LEGACY_COLORS.muted
                  : LEGACY_COLORS.green,
          }}
        >
          {AUTO_SAVE_LABEL[autoSaveStatus]}
        </div>
      )}
      <WarehouseStickySummary summary={stickySummary} />

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
            background: `color-mix(in srgb, ${LEGACY_COLORS.red} 10%, transparent)`,
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 30%, transparent)`,
            color: LEGACY_COLORS.red,
          }}
        >
          {error}
        </div>
      )}
    </>
  );
}
