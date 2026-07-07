"use client";

import type { ReactNode } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  inputTitle?: string;
  disabled?: boolean;
  decrementDisabled?: boolean;
  incrementDisabled?: boolean;
  className?: string;
}

function safeQuantity(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function QuantityStepper({
  value,
  onChange,
  label = "수량",
  inputTitle,
  disabled = false,
  decrementDisabled = false,
  incrementDisabled = false,
  className = "",
}: QuantityStepperProps) {
  const current = safeQuantity(Number(value) || 0);
  const minusDisabled = disabled || decrementDisabled;
  const plusDisabled = disabled || incrementDisabled;

  function changeBy(delta: number) {
    onChange(safeQuantity(current + delta));
  }

  function changeInput(nextValue: string) {
    onChange(safeQuantity(Number(nextValue)));
  }

  return (
    <div className={`flex flex-col items-center gap-0.5 ${className}`}>
      <span
        className="text-[9px] font-bold uppercase tracking-[1.5px]"
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        {label}
      </span>
      <div className="flex items-center gap-1">
        <StepButton tone={LEGACY_COLORS.red} disabled={minusDisabled} onClick={() => changeBy(-10)}>
          -10
        </StepButton>
        <StepButton tone={LEGACY_COLORS.red} disabled={minusDisabled} onClick={() => changeBy(-1)}>
          -1
        </StepButton>
        <input
          aria-label={label}
          type="number"
          min={0}
          step="any"
          value={current}
          disabled={disabled}
          title={inputTitle}
          onChange={(event) => changeInput(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          className="w-[72px] min-h-[44px] rounded-[10px] border px-2 py-2 text-center text-base font-black tabular-nums outline-none focus:border-[var(--c-blue)] disabled:opacity-60 lg:min-h-0 lg:py-1.5 lg:text-sm"
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
          }}
        />
        <StepButton tone={LEGACY_COLORS.green} disabled={plusDisabled} onClick={() => changeBy(1)}>
          +1
        </StepButton>
        <StepButton tone={LEGACY_COLORS.green} disabled={plusDisabled} onClick={() => changeBy(10)}>
          +10
        </StepButton>
      </div>
    </div>
  );
}

function StepButton({
  tone,
  onClick,
  disabled,
  children,
}: {
  tone: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-[44px] rounded-[10px] border px-3 py-2 text-sm font-black transition-colors hover:brightness-110 disabled:opacity-40 lg:min-h-0 lg:px-2 lg:py-1 lg:text-xs"
      style={{
        background: tint(tone, 10),
        borderColor: tint(tone, 30),
        color: tone,
      }}
    >
      {children}
    </button>
  );
}
