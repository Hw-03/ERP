"use client";

// 5.5-E: AdminBomSection 의 4-step 인디케이터 추출 (재사용 + 가독성 향상).

import { LEGACY_COLORS } from "../../legacyUi";

type Step = {
  step: string;
  label: string;
  active: boolean;
  done: boolean;
};

export function BomStepIndicator({
  parentSelected,
  childSelected,
}: {
  parentSelected: boolean;
  childSelected: boolean;
}) {
  const steps: Step[] = [
    { step: "①", label: "상위 품목 선택", active: !parentSelected, done: parentSelected },
    {
      step: "②",
      label: "하위 품목 선택",
      active: parentSelected && !childSelected,
      done: childSelected,
    },
    { step: "③", label: "소요량 입력", active: childSelected, done: false },
    { step: "④", label: "저장", active: false, done: false },
  ];

  return (
    <div className="shrink-0 flex items-center gap-2 text-xs font-bold">
      {steps.map(({ step, label, active, done }) => (
        <span
          key={step}
          className="flex items-center gap-1 rounded-full px-2.5 py-1"
          style={{
            background: done
              ? `color-mix(in srgb, ${LEGACY_COLORS.green} 14%, transparent)`
              : active
                ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 16%, transparent)`
                : LEGACY_COLORS.s2,
            color: done ? LEGACY_COLORS.green : active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
            border: `1px solid ${
              done ? LEGACY_COLORS.green : active ? LEGACY_COLORS.blue : LEGACY_COLORS.border
            }`,
          }}
        >
          {done ? "✓" : step} {label}
        </span>
      ))}
    </div>
  );
}
