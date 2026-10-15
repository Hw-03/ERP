"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { queryKeys } from "./keys";
import { itemSearchConfigOptions } from "./useItemSearch";

const STREAM_URL = "/api/realtime/stream";
const REVISION_URL = "/api/realtime/revision";
const FALLBACK_INTERVAL_MS = 1_000;
const REVISION_BATCH_WINDOW_MS = 250;

const OPERATIONAL_QUERY_ROOTS = [
  queryKeys.items.all,
  queryKeys.inventory.all,
  queryKeys.transactions.all,
  queryKeys.shipping.all,
  queryKeys.stockRequests.all,
  queryKeys.notifications.all,
  queryKeys.production.all,
  queryKeys.bom.all,
  queryKeys.warehouseMap.all,
  queryKeys.weekly.all,
  queryKeys.dailyWorkReports.all,
  queryKeys.stocktake.all,
] as const;

type RevisionSnapshot = {
  revision: number;
  updated_at: string;
};

const RealtimeRevisionContext = createContext<number | null>(null);

function parseRevisionSnapshot(value: unknown): RevisionSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const snapshot = value as Partial<RevisionSnapshot>;
  if (!Number.isSafeInteger(snapshot.revision) || (snapshot.revision ?? -1) < 0) return null;
  if (typeof snapshot.updated_at !== "string" || Number.isNaN(Date.parse(snapshot.updated_at))) {
    return null;
  }
  return snapshot as RevisionSnapshot;
}

/** Return false when metadata must recover before publishing new search results. */
export async function invalidateOperationalQueries(queryClient: QueryClient, onMetadataReady?: () => void): Promise<boolean> {
  if (queryClient.getQueryState(queryKeys.itemSearch.config())) {
    try { await queryClient.fetchQuery({ ...itemSearchConfigOptions, staleTime: 0, retry: false }); }
    catch { return false; }
  }
  onMetadataReady?.();
  await Promise.all(
    OPERATIONAL_QUERY_ROOTS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
  return true;
}

export function RealtimeSyncProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [revision, setRevision] = useState<number | null>(null);
  const currentRevision = useRef<number | null>(null);
  const appliedRevision = useRef<number | null>(null);

  useEffect(() => {
    let disposed = false;
    let source: EventSource | null = null;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let inFlightRevisionCheck: Promise<void> | null = null;
    let inFlightInvalidation: Promise<boolean> | null = null;
    let pendingRevision: number | null = null;
    let retryDelayMs = FALLBACK_INTERVAL_MS;
    let sseEpoch = 0;

    function flushPendingRevision() {
      if (
        disposed ||
        document.visibilityState === "hidden" ||
        inFlightInvalidation ||
        pendingRevision === null
      ) {
        return;
      }
      const nextRevision = pendingRevision;
      pendingRevision = null;
      if (nextRevision === appliedRevision.current) return;

      const invalidation = invalidateOperationalQueries(queryClient, () => {
        if (!disposed) setRevision(nextRevision);
      });
      inFlightInvalidation = invalidation;
      const finishInvalidation = (delayMs = REVISION_BATCH_WINDOW_MS) => {
        if (inFlightInvalidation === invalidation) inFlightInvalidation = null;
        if (!disposed) scheduleRevisionFlush(delayMs);
      };
      const retryInvalidation = () => {
        // Keep the latest pending revision and retry without publishing stale search results.
        pendingRevision ??= nextRevision;
        const delayMs = retryDelayMs;
        retryDelayMs = Math.min(retryDelayMs * 2, 30_000);
        finishInvalidation(delayMs);
      };
      void invalidation.then((success) => {
        if (!success) { retryInvalidation(); return; }
        appliedRevision.current = nextRevision;
        retryDelayMs = FALLBACK_INTERVAL_MS;
        finishInvalidation();
      }, retryInvalidation);
    }

    function scheduleRevisionFlush(delayMs = REVISION_BATCH_WINDOW_MS) {
      if (
        disposed ||
        document.visibilityState === "hidden" ||
        inFlightInvalidation ||
        pendingRevision === null ||
        flushTimer !== null
      ) {
        return;
      }
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flushPendingRevision();
      }, delayMs);
    }

    function flushPendingRevisionImmediately() {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flushPendingRevision();
    }

    const applySnapshot = (value: unknown, origin: "sse" | "get") => {
      const snapshot = parseRevisionSnapshot(value);
      if (!snapshot || disposed) return;
      if (origin === "sse") sseEpoch += 1;
      if (snapshot.revision === currentRevision.current) return;
      currentRevision.current = snapshot.revision;
      pendingRevision = snapshot.revision;
      scheduleRevisionFlush();
    };

    const checkRevision = (): Promise<void> => {
      if (inFlightRevisionCheck) return inFlightRevisionCheck;
      const requestSseEpoch = sseEpoch;
      const request = (async () => {
        try {
          const response = await fetch(REVISION_URL, { cache: "no-store" });
          if (!response.ok || disposed) return;
          const snapshot = await response.json();
          if (requestSseEpoch !== sseEpoch) return;
          applySnapshot(snapshot, "get");
        } catch {
          // Polling is best-effort while EventSource handles its own reconnects.
        }
      })();
      inFlightRevisionCheck = request;
      void request.finally(() => {
        if (inFlightRevisionCheck === request) inFlightRevisionCheck = null;
      });
      return request;
    };

    const stopFallback = () => {
      if (fallbackInterval === null) return;
      clearInterval(fallbackInterval);
      fallbackInterval = null;
    };

    const startFallback = (immediate = false) => {
      if (immediate) void checkRevision();
      if (fallbackInterval !== null) return;
      fallbackInterval = setInterval(() => void checkRevision(), FALLBACK_INTERVAL_MS);
    };

    const onRevision = (event: MessageEvent<string>) => {
      try {
        applySnapshot(JSON.parse(event.data), "sse");
      } catch {
        // Ignore malformed SSE payloads and wait for the next snapshot.
      }
    };
    const onOnline = () => void checkRevision();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        flushPendingRevisionImmediately();
        void checkRevision();
      } else if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibilityChange);

    if (typeof EventSource === "function") {
      source = new EventSource(STREAM_URL);
      source.addEventListener("revision", onRevision);
      source.onerror = () => startFallback();
      source.onopen = stopFallback;
    } else {
      startFallback(true);
    }

    return () => {
      disposed = true;
      stopFallback();
      if (flushTimer !== null) clearTimeout(flushTimer);
      pendingRevision = null;
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (source) {
        source.removeEventListener("revision", onRevision);
        source.onopen = null;
        source.onerror = null;
        source.close();
      }
    };
  }, [queryClient]);

  return (
    <RealtimeRevisionContext.Provider value={revision}>
      {children}
    </RealtimeRevisionContext.Provider>
  );
}

export function useRealtimeRevision(): number | null {
  return useContext(RealtimeRevisionContext);
}
