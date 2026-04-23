"use client";

import clsx from "clsx";
import { Minus, Plus } from "lucide-react";
import { LEGACY_COLORS } from "../../legacyUi";
import { TYPO } from "../tokens";

export function Stepper({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  bigStep = 10,
  danger = false,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  bigStep?: number;
  danger?: boolean;
  className?: string;
}) {
  const clamp = (next: number) => {
    let v = next;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    return v;
  };

  const color = danger ? LEGACY_COLORS.red : LEGACY_COLORS.blue;

  return (
    <div className={clsx("flex items-stretch overflow-hidden rounded-[14px] border", className)} style={{ borderColor: LEGACY_COLORS.border }}>
      <button
        type="button"
        onClick={() => onChange(clamp(value - bigStep))}
        className={clsx("px-2 font-bold", TYPO.caption)}
        style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.muted2 }}
        aria-label={`-${bigStep}`}
      >
        -{bigStep}
      </button>
      <button
        type="button"
        onClick={() => onChange(clamp(value - step))}
        className="flex h-10 w-10 items-center justify-center"
        style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text }}
        aria-label="감소"
      >
        <Minus size={16} />
      </button>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(clamp(Number.isNaN(n) ? 0 : n));
        }}
        className={clsx("w-16 border-x bg-transparent text-center font-black tabular-nums outline-none", TYPO.title)}
        style={{ borderColor: LEGACY_COLORS.border, color }}
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + step))}
        className="flex h-10 w-10 items-center justify-center"
        style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text }}
        aria-label="증가"
      >
        <Plus size={16} />
      </button>
      <button
        type="button"
        onClick={() => onChange(clamp(value + bigStep))}
        className={clsx("px-2 font-bold", TYPO.caption)}
        style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.muted2 }}
        aria-label={`+${bigStep}`}
      >
        +{bigStep}
      </button>
    </div>
  );
}
