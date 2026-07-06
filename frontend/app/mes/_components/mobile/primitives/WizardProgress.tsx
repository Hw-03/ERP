"use client";

import clsx from "clsx";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";

export function WizardProgress({
  steps,
  current,
  className,
  variant = "stacked",
}: {
  steps: { key: string; label: string }[];
  current: number;
  className?: string;
  variant?: "stacked" | "inline";
}) {
  const bars = (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      {steps.map((step, index) => {
        const state = index < current ? "done" : index === current ? "active" : "todo";
        return (
          <div
            key={step.key}
            className={clsx(
              "flex-1 rounded-full transition-all",
              state === "active" ? "h-[6px]" : "h-[4px]",
            )}
            style={{
              background: state === "todo" ? LEGACY_COLORS.s3 : LEGACY_COLORS.blue,
              opacity: state === "done" ? 0.9 : 1,
              boxShadow:
                state === "active"
                  ? `0 0 0 2px color-mix(in srgb, ${LEGACY_COLORS.blue} 24%, transparent)`
                  : undefined,
            }}
          />
        );
      })}
    </div>
  );

  const stepLabel = (
    <span
      className={clsx(TYPO.caption, "shrink-0 font-bold uppercase tracking-[1px]")}
      style={{ color: LEGACY_COLORS.muted2 }}
    >
      Step {current + 1} / {steps.length}
    </span>
  );

  if (variant === "inline") {
    return (
      <div className={clsx("flex min-w-0 flex-row items-center gap-2", className)}>
        {bars}
        {stepLabel}
      </div>
    );
  }

  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      {bars}
      <div className="flex items-center justify-end">{stepLabel}</div>
    </div>
  );
}
