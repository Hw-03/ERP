"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode, Ref } from "react";
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
  /** 입출고는 숫자를 클릭해 편집하고 Enter·blur에서만 확정한다. */
  inlineEdit?: boolean;
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
  inlineEdit = false,
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
        {inlineEdit ? <InlineQuantityValue value={current} onChange={onChange} label={label} min={minimum} step={step} disabled={disabled} inputTitle={inputTitle} /> : <QuantityInput
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
        />}
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

/** 입력 중인 문자열은 확정 전까지 수량 계산에 전달하지 않는다. */
function InlineQuantityValue({ value, onChange, label, min = 0, step = 1, disabled, inputTitle }: Pick<QuantityStepperProps, "value" | "onChange" | "label" | "min" | "step" | "disabled" | "inputTitle">): ReactElement {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const editingRef = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) { input.current?.focus(); input.current?.select(); }
  }, [editing]);
  useEffect(() => {
    if (disabled) { editingRef.current = false; setEditing(false); }
  }, [disabled]);

  function finish(commit: boolean): void {
    if (!editingRef.current) return;
    editingRef.current = false;
    setEditing(false);
    const text = draft.trim();
    const next = Number(text);
    const valid = (step === 1 ? /^\d+$/ : /^\d+(?:\.\d+)?$/).test(text)
      && Number.isFinite(next) && next >= min;
    if (commit && !disabled && valid && next !== value) onChange(next);
  }

  const className = "quantity-input h-11 min-h-[44px] w-[72px] rounded-[10px] border px-2 py-2 text-base font-black";
  return editing ? <input data-io-quantity-value ref={input} type="text" inputMode={step === 1 ? "numeric" : "decimal"}
    aria-label={label} value={draft} disabled={disabled} title={inputTitle} className={className}
    onChange={(event) => setDraft(event.target.value)} onBlur={() => finish(true)}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        finish(event.key === "Enter");
      }
    }} /> : <button data-io-quantity-value type="button" aria-label={`${label} 수정`} disabled={disabled}
    title={inputTitle ?? "클릭하여 수량 수정"} className={`standard-hover ${className}`}
    onClick={() => { setDraft(String(value)); editingRef.current = true; setEditing(true); }}>{value}</button>;
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
