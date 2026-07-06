"use client";

import { useEffect, useState } from "react";
import { Check, Pencil } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { AppSelect, type AppSelectOption } from "../common/AppSelect";

// ─────────────────────── 내부 atom: LabeledSelect ──────────────────

export function LabeledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: AppSelectOption[];
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
        {label}
      </span>
      <AppSelect
        value={value}
        onChange={onChange}
        options={options}
        size="sm"
        triggerStyle={{ fontSize: "0.875rem" }}
      />
    </label>
  );
}

// ─────────────────────── 내부 atom: SettingLabel ───────────────────

export function SettingLabel({ label }: { label: string }) {
  return (
    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
      {label}
    </div>
  );
}

// ───────────────────────── WizardStepCard ────────────────────────

type StepState = "active" | "complete" | "locked";

export function WizardStepCard({
  n,
  title,
  state,
  summary,
  onChange,
  accent,
  chrome,
  chromeOnly = false,
  fill = false,
  children,
}: {
  n: number;
  title: string;
  state: StepState;
  summary?: React.ReactNode;
  onChange?: () => void;
  accent?: string;
  chrome?: React.ReactNode;
  chromeOnly?: boolean;
  /** active 상태에서 부모 flex 컬럼 안에서 남은 세로 공간을 모두 차지 (기본 false). */
  fill?: boolean;
  children?: React.ReactNode;
}) {
  const tone = accent ?? LEGACY_COLORS.blue;
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const animStyle = {
    opacity: mounted ? 1 : 0,
    transform: mounted ? "translateY(0)" : "translateY(-10px)",
    transition:
      "opacity 280ms ease, transform 280ms ease, border-color 240ms cubic-bezier(0.16,1,0.3,1), background-color 240ms ease, padding 240ms ease",
  } as const;

  if (state === "active") {
    return (
      <section
        className={`rounded-[24px] border-2 p-4 lg:p-6${fill ? " flex flex-1 flex-col min-h-0" : ""}`}
        style={{
          backgroundColor: LEGACY_COLORS.s1,
          borderColor: `color-mix(in srgb, ${tone} 50%, transparent)`,
          boxShadow: "var(--c-card-shadow)",
          backgroundImage: "var(--c-panel-glow)",
          ...animStyle,
        }}
      >
        {chromeOnly && chrome ? (
          <header className="mb-5">{chrome}</header>
        ) : (
          <header className={chrome ? "mb-5 flex items-start gap-3" : "mb-5 flex items-center gap-3"}>
            <span
              data-testid="wizard-active-step-number"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-black text-white"
              style={{ background: tone }}
            >
              {n}
            </span>
            <div className="min-w-0 flex-1">
              <div
                data-testid="wizard-active-step-title"
                className="text-xl font-black leading-tight"
                style={{ color: LEGACY_COLORS.text }}
              >
                {title}
              </div>
              {chrome}
            </div>
          </header>
        )}
        {fill ? (
          <div className="flex flex-1 flex-col min-h-0">{children}</div>
        ) : (
          children
        )}
      </section>
    );
  }

  if (state === "complete") {
    const handleKey = (e: React.KeyboardEvent<HTMLElement>) => {
      if (!onChange) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onChange();
      }
    };
    return (
      <section
        role={onChange ? "button" : undefined}
        tabIndex={onChange ? 0 : undefined}
        onClick={onChange}
        onKeyDown={onChange ? handleKey : undefined}
        className="group flex items-center gap-3 rounded-[18px] border px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-offset-0"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: `color-mix(in srgb, ${LEGACY_COLORS.green} 30%, ${LEGACY_COLORS.border})`,
          cursor: onChange ? "pointer" : "default",
          ...animStyle,
        }}
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ background: LEGACY_COLORS.green }}
        >
          <Check className="h-4 w-4" color="#041008" strokeWidth={3} />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="text-[10px] font-bold uppercase tracking-[1.5px]"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            {n}. {title}
          </div>
          <div className="truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
            {summary}
          </div>
        </div>
        {onChange && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange();
            }}
            className="flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors group-hover:brightness-125"
            style={{
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 30%, ${LEGACY_COLORS.border})`,
              color: LEGACY_COLORS.blue,
              background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 8%, transparent)`,
            }}
          >
            <Pencil className="h-3 w-3" />
            변경
          </button>
        )}
      </section>
    );
  }

  // locked
  return (
    <section
      className="pointer-events-none flex items-center gap-3 rounded-[18px] border px-4 py-3 opacity-50"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, ...animStyle }}
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black"
        style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.muted2 }}
      >
        {n}
      </span>
      <div className="min-w-0 flex-1 text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
        {title}
      </div>
    </section>
  );
}
