import type { ReactNode } from "react";
import type { StocktakeVariant } from "./StocktakeLayout";

type Props = {
  variant: StocktakeVariant; section: StocktakeSection; disabled?: boolean;
  waitingCount?: number;
  canManageRounds?: boolean;
  onChange: (section: StocktakeSection) => void; filterControl?: ReactNode;
};

export type StocktakeSection = "count" | "waiting" | "progress" | "rounds";

/** Keep the main tasks visible independently of the round picker. */
export function StocktakeSectionTabs({ section, disabled = false, onChange, waitingCount, canManageRounds = false }: {
  section: StocktakeSection; disabled?: boolean; waitingCount?: number; canManageRounds?: boolean; onChange: (section: StocktakeSection) => void;
}): ReactNode {
  return <nav className={`grid min-w-0 flex-1 ${canManageRounds ? "grid-cols-4" : "grid-cols-3"} gap-2`} aria-label="전수조사 메뉴">
    {([["count", "조사하기"], ["waiting", "반영 대기"], ["progress", "진행"], ["rounds", "회차 이력 관리"]] as const).filter(([id]) => id !== "rounds" || canManageRounds).map(([id, label]) =>
      <button key={id} type="button" aria-pressed={section === id} className={`standard-hover min-h-11 min-w-0 rounded-[14px] border px-1 text-sm font-semibold shadow-sm transition enabled:active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-blue)] disabled:cursor-not-allowed disabled:opacity-50 ${section === id ? "border-[var(--c-blue)] bg-[color-mix(in_srgb,var(--c-blue)_12%,var(--c-s1))] text-[var(--c-blue)]" : "border-[var(--c-border-strong)] bg-[var(--c-s1)] text-[var(--c-muted2)] enabled:hover:border-[var(--c-blue)]"}`} disabled={disabled} onClick={() => onChange(id)}>
        <span className={id === "rounds" ? "whitespace-normal break-keep" : "whitespace-nowrap"}>{label}</span>{id === "waiting" && waitingCount !== undefined && <span className="ml-1 inline-block tabular-nums">{waitingCount.toLocaleString()}</span>}
      </button>)}
  </nav>;
}

/** Share one toolbar row between the loaded screen and its initial skeleton. */
export function StocktakeToolbarMenu({ variant, section, disabled = false, onChange, filterControl, waitingCount, canManageRounds = false }: Props): ReactNode {
  return <div className={`flex items-stretch gap-2 ${variant === "mobile" ? "h-[54px]" : "h-[58px]"}`}>
    <StocktakeSectionTabs section={section} disabled={disabled} onChange={onChange} waitingCount={waitingCount} canManageRounds={canManageRounds} />
    {filterControl}
  </div>;
}
