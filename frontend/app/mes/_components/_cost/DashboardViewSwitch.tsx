"use client";

import { Boxes, Calculator, Zap } from "lucide-react";
export type DashboardView = "inventory" | "capacity" | "cost";

/** Dashboard views share a control while each view owns its navigation guard. */
export function DashboardViewSwitch({ active, onChange, disabled = false }: {
  active: DashboardView;
  onChange: (view: DashboardView) => void;
  disabled?: boolean;
}) {
  return <div role="group" aria-label="대시보드 보기" className="relative flex w-[420px] shrink-0 rounded-[20px] border p-1.5" style={{ borderColor: "color-mix(in srgb, var(--c-blue) 18%, var(--c-border))", background: "var(--c-s2)", boxShadow: "inset 0 1px 0 var(--c-s1)" }}>
    <span aria-hidden="true" className="pointer-events-none absolute bottom-1.5 left-1.5 top-1.5 w-[calc((100%-12px)/3)] rounded-[14px] border transition-transform duration-300 motion-reduce:transition-none" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--c-blue) 22%, var(--c-s1)), color-mix(in srgb, var(--c-blue) 12%, var(--c-s1)))", borderColor: "color-mix(in srgb, var(--c-blue) 26%, transparent)", boxShadow: "0 3px 10px color-mix(in srgb, var(--c-blue) 12%, transparent)", transform: `translateX(${active === "cost" ? "200%" : active === "capacity" ? "100%" : "0"})` }} />
    {([ ["inventory", "재고 현황", Boxes], ["capacity", "생산 가능", Zap], ["cost", "원가 분석", Calculator] ] as const).map(([view, label, Icon]) => <button key={view} type="button" aria-pressed={active === view} disabled={disabled} onKeyDown={event => { const buttons = Array.from(event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>("button")); const index = buttons.indexOf(event.currentTarget); const next = event.key === "ArrowRight" ? (index + 1) % 3 : event.key === "ArrowLeft" ? (index + 2) % 3 : event.key === "Home" ? 0 : event.key === "End" ? 2 : -1; if (next >= 0) { event.preventDefault(); buttons[next].focus(); } }} onClick={() => { onChange(view); }} className="relative z-10 flex min-h-11 flex-1 items-center justify-center gap-2.5 rounded-[14px] px-3 text-sm font-bold transition-colors hover:text-[var(--c-blue)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)] disabled:opacity-40" style={{ color: active === view ? "var(--c-blue)" : "var(--c-muted2)" }}><Icon aria-hidden="true" size={20} strokeWidth={active === view ? 2.25 : 1.75} className="shrink-0" />{label}</button>)}
  </div>;
}
