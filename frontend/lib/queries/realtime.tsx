"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { queryKeys } from "./keys";

const STREAM_URL = "/api/realtime/stream";
const REVISION_URL = "/api/realtime/revision";
const FALLBACK_INTERVAL_MS = 1_000;

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

export async function invalidateOperationalQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    OPERATIONAL_QUERY_ROOTS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

export function RealtimeSyncProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [revision, setRevision] = useState<number | null>(null);
  const currentRevision = useRef<number | null>(null);

  useEffect(() => {
    let disposed = false;
    let source: EventSource | null = null;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;
    let inFlightRevisionCheck: Promise<void> | null = null;
    let sseEpoch = 0;

    const applySnapshot = (value: unknown, origin: "sse" | "get") => {
      const snapshot = parseRevisionSnapshot(value);
      if (!snapshot || disposed) return;
      if (origin === "sse") sseEpoch += 1;
      if (snapshot.revision === currentRevision.current) return;
      currentRevision.current = snapshot.revision;
      setRevision(snapshot.revision);
      void invalidateOperationalQueries(queryClient);
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
      if (document.visibilityState === "visible") void checkRevision();
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
