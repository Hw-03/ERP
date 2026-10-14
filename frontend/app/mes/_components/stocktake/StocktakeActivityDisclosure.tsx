import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { STOCKTAKE_CARD } from "./StocktakeCountEditor";

type Props = {
  title: string;
  icon?: ReactNode;
  includeSaves: boolean;
  onIncludeSavesChange: (included: boolean) => void;
  defaultOpen?: boolean;
  compact?: boolean;
  children: ReactNode;
};

/** Keep the full header clickable while the independent filter occupies the same row. */
export function StocktakeActivityDisclosure({ title, icon, includeSaves, onIncludeSavesChange, defaultOpen = false, compact = false, children }: Props): ReactNode {
  return <details open={defaultOpen || undefined} className={`${STOCKTAKE_CARD} relative !p-0 group/activity-disclosure`} aria-label={title}>
    <summary className={`flex cursor-pointer items-center justify-between gap-2 px-4 ${compact ? "min-h-[60px] py-2" : "min-h-[76px] py-4"}`}>
      <h2 className="flex min-w-0 items-center gap-2 pr-36 text-base font-semibold">{icon}{title}</h2>
      <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-[var(--c-muted2)] transition-transform group-open/activity-disclosure:rotate-180" />
    </summary>
    <label className={`absolute right-12 flex min-h-11 cursor-pointer items-center gap-2 text-xs text-[var(--c-muted2)] ${compact ? "top-2" : "top-4"}`}><input type="checkbox" checked={includeSaves} onChange={event => onIncludeSavesChange(event.target.checked)} />자동저장 포함</label>
    <div className="min-w-0 px-4 pb-4">{children}</div>
  </details>;
}
