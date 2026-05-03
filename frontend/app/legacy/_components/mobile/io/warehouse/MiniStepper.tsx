"use client";

import { Minus, Plus } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../../tokens";

/**
 * Round-13 (#12) 추출 — Warehouse StepItems 의 -10/-1/+1/+10 mini stepper.
 * 최소 1 보장 (`Math.max(1, value + delta)`).
 */
export function MiniStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const step = (delta: number) => onChange(Math.max(1, value + delta));
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => step(-10)}
        className={`${TYPO.caption} rounded-[10px] px-2 py-1 font-bold`}
        style={{ background: `${LEGACY_COLORS.red as string}22`, color: LEGACY_COLORS.red }}
      >
        -10
      </button>
      <button
        type="button"
        onClick={() => step(-1)}
        className="flex h-8 w-8 items-center justify-center rounded-[10px]"
        style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.text }}
      >
        <Minus size={14} />
      </button>
      <div
        className={`${TYPO.body} min-w-[54px] rounded-[10px] px-2 py-1 text-center font-black tabular-nums`}
        style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.blue }}
      >
        {value}
      </div>
      <button
        type="button"
        onClick={() => step(1)}
        className="flex h-8 w-8 items-center justify-center rounded-[10px]"
        style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.text }}
      >
        <Plus size={14} />
      </button>
      <button
        type="button"
        onClick={() => step(10)}
        className={`${TYPO.caption} rounded-[10px] px-2 py-1 font-bold`}
        style={{ background: `${LEGACY_COLORS.green as string}22`, color: LEGACY_COLORS.green }}
      >
        +10
      </button>
    </div>
  );
}
