import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { STOCKTAKE_CARD } from "./StocktakeCountEditor";

/** Native disclosure keeps command forms mounted while hiding their controls. */
export function StocktakeDisclosure({ title, children, feedback, defaultOpen = false, variant = "inset" }: { title: string; children: ReactNode; feedback?: ReactNode; defaultOpen?: boolean; variant?: "inset" | "card" }): ReactNode {
  return <details open={defaultOpen || undefined} className={variant === "card" ? `${STOCKTAKE_CARD} group !p-0 text-[var(--c-text)]` : "group rounded-[20px] border border-[var(--c-border)] bg-[var(--c-s2)] text-[var(--c-text)]"}>
    <summary className={`flex cursor-pointer items-center justify-between gap-3 px-4 font-semibold ${variant === "card" ? "min-h-[60px] py-2 text-base" : "min-h-11 py-3 text-sm"}`}>
      {variant === "card" ? <h2 className="shrink-0">{title}</h2> : title}{feedback && <div className="min-w-0 flex-1">{feedback}</div>}<ChevronDown size={16} aria-hidden="true" className="shrink-0 text-[var(--c-muted2)] transition-transform group-open:rotate-180" />
    </summary>
    <div className={variant === "card" ? "space-y-3 px-4 pb-4" : "space-y-3 border-t border-[var(--c-border)] p-3"}>{children}</div>
  </details>;
}
