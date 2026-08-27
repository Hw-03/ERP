"use client";

import type { ReactNode, Ref } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { QuantityInput } from "../common/QuantityInput";

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  inputTitle?: string;
  disabled?: boolean;
  decrementDisabled?: boolean;
  incrementDisabled?: boolean;
  min?: number;
  step?: number | "any";
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
}

function safeMinimum(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function safeQuantity(value: number, min: number) {
  return Number.isFinite(value) ? Math.max(min, value) : min;
}

export function QuantityStepper({
  value,
  onChange,
  label = "수량",
  inputTitle,
  disabled = false,
  decrementDisabled = false,
  incrementDisabled = false,
  min = 0,
  step = "any",
  inputRef,
  className = "",
}: QuantityStepperProps) {
  const minimum = safeMinimum(min);
  const current = safeQuantity(Number(value), minimum);
  const minusDisabled = disabled || decrementDisabled || current <= minimum;
  const plusDisabled = disabled || incrementDisabled;

  function changeBy(delta: number) {
    onChange(safeQuantity(current + delta, minimum));
  }

  function changeInput(nextValue: string) {
    onChange(safeQuantity(Number(nextValue), minimum));
  }

  return (
    <div className={`flex flex-col items-center gap-0.5 ${className}`}>
      <span
        className="text-xs font-bold uppercase tracking-[1.5px]"
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
        <QuantityInput
          aria-label={label}
          min={minimum}
          step={step}
          value={current}
          ref={inputRef}
          disabled={disabled}
          title={inputTitle}
          onChange={(event) => changeInput(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          className="h-11 min-h-[44px] w-[72px] rounded-[10px] border px-2 py-2 text-base font-black"
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
      className="standard-hover h-11 min-h-[44px] rounded-[10px] border px-3 py-2 text-sm font-black transition-colors disabled:opacity-40"
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
