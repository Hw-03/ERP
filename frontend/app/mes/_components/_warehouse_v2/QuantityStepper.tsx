"use client";

import { useEffect, useRef } from "react";
import type { ReactNode, Ref } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
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
  step = 1,
  inputRef,
  className = "",
}: QuantityStepperProps) {
  const minimum = safeMinimum(min);
  const current = safeQuantity(Number(value), minimum);
  const minusDisabled = disabled || decrementDisabled || current <= minimum;
  const plusDisabled = disabled || incrementDisabled;
  const repeatDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => () => {
    if (repeatDelayRef.current) clearTimeout(repeatDelayRef.current);
    if (repeatIntervalRef.current) clearInterval(repeatIntervalRef.current);
  }, []);

  function changeBy(delta: number) {
    onChange(safeQuantity(current + delta, minimum));
  }

  function changeInput(nextValue: string) {
    const next = Number(nextValue);
    if (step === 1 && !Number.isInteger(next)) return;
    onChange(safeQuantity(next, minimum));
  }

  function stopRepeating() {
    if (repeatDelayRef.current) clearTimeout(repeatDelayRef.current);
    if (repeatIntervalRef.current) clearInterval(repeatIntervalRef.current);
    repeatDelayRef.current = null;
    repeatIntervalRef.current = null;
  }

  function startRepeating(delta: number, repeatDisabled: boolean) {
    if (repeatDisabled) return;
    stopRepeating();
    suppressClickRef.current = false;
    let repeatedValue = current;

    const emitNext = () => {
      const next = safeQuantity(repeatedValue + delta, minimum);
      if (next === repeatedValue) {
        stopRepeating();
        return;
      }
      repeatedValue = next;
      onChange(next);
    };

    repeatDelayRef.current = setTimeout(() => {
      suppressClickRef.current = true;
      emitNext();
      repeatIntervalRef.current = setInterval(emitNext, 80);
    }, 350);
  }

  function clickArrow(delta: number) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    changeBy(delta);
  }

  return (
    <div data-io-stepper className={`flex flex-col items-center gap-0.5 ${className}`}>
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
          inputMode={step === 1 ? "numeric" : "decimal"}
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
        <div data-io-arrow-controls className="hidden">
          <button
            type="button"
            aria-label={`${label} 1 증가`}
            disabled={plusDisabled}
            onPointerDown={() => startRepeating(1, plusDisabled)}
            onPointerUp={stopRepeating}
            onPointerCancel={stopRepeating}
            onPointerLeave={stopRepeating}
            onBlur={stopRepeating}
            onClick={() => clickArrow(1)}
            className="no-btn-inset"
          >
            <ChevronUp aria-hidden="true" className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={`${label} 1 감소`}
            disabled={minusDisabled}
            onPointerDown={() => startRepeating(-1, minusDisabled)}
            onPointerUp={stopRepeating}
            onPointerCancel={stopRepeating}
            onPointerLeave={stopRepeating}
            onBlur={stopRepeating}
            onClick={() => clickArrow(-1)}
            className="no-btn-inset"
          >
            <ChevronDown aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
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
