"use client";

import clsx from "clsx";
import { LEGACY_COLORS } from "../../legacyUi";
import { TYPO } from "../tokens";

export function WizardProgress({
  steps,
  current,
  className,
}: {
  steps: { key: string; label: string }[];
  current: number;
  className?: string;
}) {
  const active = steps[current];
  return (
    <div className={clsx("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-1">
        {steps.map((step, index) => {
          const state = index < current ? "done" : index === current ? "active" : "todo";
          const bg =
            state === "active"
              ? LEGACY_COLORS.blue
              : state === "done"
              ? `${LEGACY_COLORS.blue as string}88`
              : LEGACY_COLORS.s3;
          return (
            <div
              key={step.key}
              className="h-[4px] flex-1 rounded-full transition-colors"
              style={{ background: bg }}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        <div className={clsx(TYPO.caption, "font-semibold")} style={{ color: LEGACY_COLORS.muted2 }}>
          Step {current + 1} / {steps.length}
        </div>
        <div className={clsx(TYPO.caption, "font-black")} style={{ color: LEGACY_COLORS.blue }}>
          {active?.label}
        </div>
      </div>
    </div>
  );
}
