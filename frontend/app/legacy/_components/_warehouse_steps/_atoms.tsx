"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Pencil } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";

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
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[9px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
        {label}
      </span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-[10px] border px-2 py-1.5 pr-6 text-xs font-semibold outline-none"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2" style={{ color: LEGACY_COLORS.muted2 }} />
      </div>
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
  children,
}: {
  n: number;
  title: string;
  state: StepState;
  summary?: React.ReactNode;
  onChange?: () => void;
  accent?: string;
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
        className="rounded-[24px] border-2 p-6"
        style={{
          backgroundColor: LEGACY_COLORS.s1,
          borderColor: `color-mix(in srgb, ${tone} 50%, transparent)`,
          boxShadow: "var(--c-card-shadow)",
          backgroundImage: "var(--c-panel-glow)",
          ...animStyle,
        }}
      >
        <header className="mb-5 flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-black text-white"
            style={{ background: tone }}
          >
            {n}
          </span>
          <div className="min-w-0">
            <div className="text-xl font-black leading-tight" style={{ color: LEGACY_COLORS.text }}>
              {title}
            </div>
          </div>
        </header>
        {children}
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
