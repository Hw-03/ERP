"use client";

import clsx from "clsx";
import { LEGACY_COLORS } from "@/lib/mes/color";
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
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      {/* 항목 17 — 완료=진한 채움, 현재=더 두껍게+링 강조, 미래=흐리게 */}
      <div className="flex items-center gap-1.5">
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
      {/* 항목 4-8 — 단계명 텍스트 제거, STEP N/N 만 우측 정렬(좌측 뒤로 버튼과 겹치지 않게). */}
      <div className="flex items-center justify-end">
        <span
          className={clsx(TYPO.caption, "shrink-0 font-bold uppercase tracking-[1px]")}
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          Step {current + 1} / {steps.length}
        </span>
      </div>
    </div>
  );
}
