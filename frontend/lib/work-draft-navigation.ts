import type { WorkDraftFilters, WorkDraftSelection } from "./api/types/work-drafts";
import { restoreOperatorSession } from "./auth/operator-session";
import { getOperatorAccessContext } from "@/app/mes/_components/login/useCurrentOperator";

const RETURN_KEY = "warehouseWorkReturnKey";

export interface WorkListReturn {
  scope: "all";
  filters: WorkDraftFilters;
  filtersOpen: boolean;
  selected: WorkDraftSelection | null;
  scrollTop: number;
  scrollLeft: number;
  outerScrollTop?: number;
  listScrolled: boolean;
}

interface Entry {
  employeeId: string;
  identity: string;
  href: string;
  view: WorkListReturn;
}

// Keep only display state in memory. History contains an opaque key, never data or credentials.
const entries = new Map<string, Entry>();

export function workDraftIdentity(): string {
  const session = restoreOperatorSession();
  return JSON.stringify([getOperatorAccessContext(), session?.employee_id, session?.token]);
}

export function clearWorkListReturns(): void {
  entries.clear();
}

/** Fresh menu entries must not inherit the source entry's return address. */
export function withoutWorkListReturn(state: unknown): Record<string, unknown> {
  const next = state && typeof state === "object" ? { ...state } as Record<string, unknown> : {};
  delete next[RETURN_KEY];
  return next;
}

export function forgetCurrentWorkListReturn(): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(withoutWorkListReturn(window.history.state), "");
}

/** Commit the visible list to this entry before the existing shipping link pushes its destination. */
export function saveWorkListReturn(employeeId: string, view: WorkListReturn): void {
  if (typeof window === "undefined" || !restoreOperatorSession(employeeId)) return;
  const url = new URL(window.location.href);
  if (url.searchParams.get("tab") !== "warehouse") return;
  url.searchParams.set("section", "cart");
  for (const key of ["step", "draftId", "stockRequestId"]) url.searchParams.delete(key);
  const previous = window.history.state?.[RETURN_KEY];
  const key = typeof previous === "string" && entries.has(previous) ? previous : crypto.randomUUID();
  entries.set(key, { employeeId, identity: workDraftIdentity(), href: url.href,
    view: { ...view, filters: { ...view.filters }, selected: view.selected ? { ...view.selected } : null } });
  window.history.replaceState({ ...window.history.state, [RETURN_KEY]: key }, "", url);
}

/** Only this exact history entry and the original authenticated access context may restore it. */
export function readWorkListReturn(employeeId: string): WorkListReturn | null {
  if (typeof window === "undefined" || !restoreOperatorSession(employeeId)) return null;
  const key = window.history.state?.[RETURN_KEY];
  const entry = typeof key === "string" ? entries.get(key) : undefined;
  if (!entry || entry.employeeId !== employeeId || entry.identity !== workDraftIdentity() || entry.href !== window.location.href) return null;
  return { ...entry.view, filters: { ...entry.view.filters }, selected: entry.view.selected ? { ...entry.view.selected } : null };
}

/** Undo a cancelled Back by traversing forward; replacing the source would erase its list entry. */
export function resumeWorkListShippingEntry(employeeId: string, shippingUrl: string): boolean {
  const source = readWorkListReturn(employeeId);
  if (source?.selected?.kind !== "shipping") return false;
  const destination = new URL(shippingUrl, window.location.href);
  if (destination.searchParams.get("tab") !== "shipping" || destination.searchParams.get("shippingView") !== "requestDetail"
      || destination.searchParams.get("shippingRequestId") !== source.selected.id) return false;
  window.history.forward();
  return true;
}
