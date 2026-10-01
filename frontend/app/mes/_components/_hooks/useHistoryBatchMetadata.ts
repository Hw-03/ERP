"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQueries } from "@tanstack/react-query";
import { ioApi } from "@/lib/api/io";
import type { IoBatch } from "@/lib/api/types/io";
import { queryKeys } from "@/lib/queries/keys";
import type { LogGroup } from "../_history_sections/historyTableHelpers";

/** 목록 배지에 필요한 배치 정보만 조회하고 PC 상세와 같은 캐시에 저장한다. */
export function useHistoryBatchMetadata(
  groups: LogGroup[],
  batchCache: Map<string, IoBatch>,
  setBatchCache: React.Dispatch<React.SetStateAction<Map<string, IoBatch>>>,
  cacheEpoch?: number | null,
): { failed: boolean; retry: () => void } {
  const ids = useMemo(() => Array.from(new Set(groups.flatMap((group) =>
    group.type === "op_batch" ? [group.batchId] : [],
  ))), [groups]);
  const applied = useRef(new Map<string, IoBatch>());
  const queries = useQueries({ queries: ids.map((id) => ({
    queryKey: [...queryKeys.transactions.all, "batchMetadata", id, cacheEpoch ?? null],
    queryFn: ({ signal }: { signal: AbortSignal }) => ioApi.getBatch(id, { signal }),
    initialData: () => batchCache.get(id),
    initialDataUpdatedAt: 0,
    staleTime: 30_000,
    retry: false,
  })) });
  useEffect(() => {
    const ready = queries.flatMap((query, index) => {
      const key = `${cacheEpoch ?? ""}:${ids[index]}`;
      if (!query.isFetched || !query.data || applied.current.get(key) === query.data) return [];
      applied.current.set(key, query.data);
      return [[ids[index], query.data] as const];
    });
    if (ready.length === 0 || ready.every(([id, batch]) => batchCache.get(id) === batch)) return;
    setBatchCache((previous) => {
      const next = new Map(previous);
      ready.forEach(([id, batch]) => next.set(id, batch));
      return next;
    });
  }, [batchCache, cacheEpoch, ids, queries, setBatchCache]);
  return { failed: queries.some((query) => query.isError), retry: () => {
    queries.filter((query) => query.isError).forEach((query) => { void query.refetch(); });
  } };
}
