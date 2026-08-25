import type { IoStep } from "./useIoWorkState";

function replaceWarehouseUrl(url: URL): void {
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export function parseWarehouseStep(raw: string | null): IoStep | undefined {
  const step = Number(raw);
  return step >= 1 && step <= 5 ? step as IoStep : undefined;
}

export function persistWarehouseDraftUrl(batchId: string, step: IoStep): void {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", "warehouse");
  url.searchParams.set("section", "compose");
  url.searchParams.set("step", String(step));
  url.searchParams.set("draftId", batchId);
  replaceWarehouseUrl(url);
}

export function clearWarehouseDraftRestore<T extends { batch_id: string }>(
  batchId: string,
  setRestoreDraft: (update: (current: T | null) => T | null) => void,
  restoredDraftRef: { current: string | null },
): void {
  const url = new URL(window.location.href);
  if (url.searchParams.get("draftId") === batchId) {
    url.searchParams.delete("draftId");
    replaceWarehouseUrl(url);
  }
  setRestoreDraft((current) => current?.batch_id === batchId ? null : current);
  if (restoredDraftRef.current === batchId) restoredDraftRef.current = null;
}
