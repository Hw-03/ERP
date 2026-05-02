"use client";

import { ChevronRight } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../../tokens";
import { WAREHOUSE_MODE_META, type WarehouseMode } from "./warehouseWizardConfig";
import { useWarehouseWizard } from "./context";
import { StepHeading } from "./wizardStepShared";

/**
 * Round-11A (#1) 추출 — WarehouseWizard Step 1 (유형 선택).
 */
export function StepType() {
  const { state, dispatch } = useWarehouseWizard();
  const current = state.mode as WarehouseMode | null;

  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
      <StepHeading title="이 작업의 유형을 결정합니다" hint="선택하면 바로 다음 단계로 넘어갑니다" />
      <div className="flex flex-col gap-2">
        {(Object.keys(WAREHOUSE_MODE_META) as WarehouseMode[]).map((mode) => {
          const meta = WAREHOUSE_MODE_META[mode];
          const Icon = meta.icon;
          const active = current === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => {
                dispatch({ type: "SET_MODE", mode });
                dispatch({ type: "NEXT" });
              }}
              className="flex items-center gap-3 rounded-[20px] border px-4 py-4 text-left active:scale-[0.99]"
              style={{
                background: active ? `${LEGACY_COLORS.blue as string}14` : LEGACY_COLORS.s2,
                borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
              }}
            >
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
                style={{ background: `${LEGACY_COLORS.blue as string}22`, color: LEGACY_COLORS.blue }}
              >
                <Icon size={22} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <div className={`${TYPO.title} font-black`} style={{ color: LEGACY_COLORS.text }}>
                  {meta.label}
                </div>
                <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                  {meta.description}
                </div>
              </div>
              <ChevronRight size={20} color={LEGACY_COLORS.muted} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
