"use client";

import clsx from "clsx";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";
import { SummaryChipBar, type SummaryChip } from "./SummaryChipBar";

export function WizardHeader({
  steps,
  current,
  chips,
  className,
}: {
  steps: { key: string; label: string }[];
  current: number;
  chips?: SummaryChip[];
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
      <div className="flex items-center justify-between gap-2">
        <div
          className={clsx(TYPO.overline, "shrink-0 font-bold uppercase tracking-[2px]")}
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          Step {current + 1} / {steps.length}
        </div>
        <div
          className={clsx(TYPO.caption, "truncate font-black")}
          style={{ color: LEGACY_COLORS.blue }}
        >
          {active?.label}
        </div>
      </div>
      {chips && chips.length > 0 ? (
        <SummaryChipBar chips={chips} className="pt-1" />
      ) : null}
    </div>
  );
}
