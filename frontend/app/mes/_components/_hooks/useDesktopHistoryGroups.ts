"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { productionApi, type TransactionDisplayGroup, type TransactionDisplayGroupPage } from "@/lib/api/production";
import { queryKeys } from "@/lib/queries/keys";
import { STALE_TIME } from "@/lib/queries/client";
import { HISTORY_PAGE_SIZE } from "../_history_sections/historyConstants";
import { dateFilterToFrom } from "../_history_sections/historyQuery";
import type { UseHistoryDataArgs } from "./useHistoryData";

export interface UseDesktopHistoryGroupsResult {
  groups: TransactionDisplayGroup[];
  setGroups: React.Dispatch<React.SetStateAction<TransactionDisplayGroup[]>>;
  loading: boolean;
  error: string | null;
  retry: () => void;
  loadingMore: boolean;
  loadMoreError: string | null;
  canLoadMore: boolean;
  loadMore: () => Promise<void>;
}

function historyLoadError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

/** PC 목록 전용: 서버가 완결된 대표 묶음과 커서를 함께 반환한다. */
export function useDesktopHistoryGroups({
  operations,
  dateFilter,
  debouncedSearch,
  selectedDateKey,
  department,
  model = "",
  realtimeRevision,
}: UseHistoryDataArgs): UseDesktopHistoryGroupsResult {
  const queryClient = useQueryClient();
  const operationKeys = operations || undefined;
  const dateFrom = selectedDateKey ?? dateFilterToFrom(dateFilter);
  const dateTo = selectedDateKey ?? undefined;
  const search = debouncedSearch.trim() || undefined;
  const departmentParam = department || undefined;
  const modelParam = model || undefined;
  const queryIdentity = JSON.stringify([
    operationKeys ?? null,
    dateFrom ?? null,
    dateTo ?? null,
    search ?? null,
    departmentParam ?? null,
    modelParam ?? null,
  ]);

  function pageParams(cursor: string | null = null) {
    return {
      limit: HISTORY_PAGE_SIZE,
      cursor,
      operationKeys,
      dateFrom,
      dateTo,
      search,
      department: departmentParam,
      model: modelParam,
    };
  }

  const initialParams = pageParams();
  const [initialCached] = useState(() =>
    queryClient.getQueryData<TransactionDisplayGroupPage>(queryKeys.transactions.displayGroups(initialParams)),
  );
  const [groups, setGroups] = useState<TransactionDisplayGroup[]>(() => initialCached?.groups ?? []);
  const [loading, setLoading] = useState(() => initialCached === undefined);
  const loadingRef = useRef(initialCached === undefined);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(initialCached?.nextCursor ?? null);
  const hasMoreRef = useRef(initialCached?.hasMore ?? false);
  const [hasMore, setHasMore] = useState(initialCached?.hasMore ?? false);
  const queryIdentityRef = useRef(queryIdentity);
  const generationRef = useRef(0);
  const isFirstRunRef = useRef(true);
  const retryQueryIdentityRef = useRef<string | null>(null);
  const realtimeRevisionRef = useRef(realtimeRevision);
  const loadedPageCountRef = useRef(1);
  const loadedTailGroupKeyRef = useRef(initialCached?.groups.at(-1)?.key ?? null);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    loadingRef.current = true;
    const isRetry = retryQueryIdentityRef.current === queryIdentity;
    retryQueryIdentityRef.current = null;
    const queryChanged = queryIdentityRef.current !== queryIdentity;
    const revisionChanged = realtimeRevisionRef.current !== realtimeRevision;
    const shouldRefreshLoadedDepth = revisionChanged && !queryChanged;
    const pagesToRefresh = shouldRefreshLoadedDepth ? loadedPageCountRef.current : 1;
    const refreshAnchorGroupKey = shouldRefreshLoadedDepth ? loadedTailGroupKeyRef.current : null;
    queryIdentityRef.current = queryIdentity;
    const params = pageParams();
    const skipReset = isRetry || (isFirstRunRef.current && initialCached !== undefined);
    isFirstRunRef.current = false;
    setError(null);
    loadingMoreRef.current = false;
    setLoadingMore(false);
    setLoadMoreError(null);
    if (!skipReset) {
      cursorRef.current = null;
      hasMoreRef.current = false;
      setHasMore(false);
      setGroups([]);
      setLoading(true);
    }

    void (async () => {
      const refreshedPages: TransactionDisplayGroupPage[] = [];
      let nextParams = params;
      for (let pageIndex = 0; ; pageIndex += 1) {
        const pageQueryKey = queryKeys.transactions.displayGroups(nextParams);
        if (revisionChanged) {
          await queryClient.cancelQueries({ queryKey: pageQueryKey, exact: true });
          await queryClient.invalidateQueries({ queryKey: pageQueryKey, exact: true, refetchType: "none" });
        }
        const page = await queryClient.fetchQuery({
          queryKey: pageQueryKey,
          queryFn: ({ signal }) => productionApi.getTransactionDisplayGroups(nextParams, { signal }),
          staleTime: STALE_TIME.VOLATILE,
        });
        refreshedPages.push(page);
        const reachedPreviousDepth = pageIndex + 1 >= pagesToRefresh;
        const reachedRefreshAnchor = refreshAnchorGroupKey === null
          || page.groups.some((group) => group.key === refreshAnchorGroupKey);
        if (!page.hasMore || !page.nextCursor || (reachedPreviousDepth && reachedRefreshAnchor)) break;
        nextParams = pageParams(page.nextCursor);
      }
      return refreshedPages;
    })().then((pages) => {
      if (generationRef.current !== generation || queryIdentityRef.current !== queryIdentity) return;
      const lastPage = pages.at(-1);
      const refreshedGroups = pages.flatMap((page) => page.groups);
      cursorRef.current = lastPage?.nextCursor ?? null;
      hasMoreRef.current = lastPage?.hasMore ?? false;
      loadedPageCountRef.current = Math.max(1, pages.length);
      loadedTailGroupKeyRef.current = refreshedGroups.at(-1)?.key ?? null;
      realtimeRevisionRef.current = realtimeRevision;
      setGroups(refreshedGroups);
      setHasMore(lastPage?.hasMore ?? false);
      setError(null);
      loadingRef.current = false;
      setLoading(false);
    }).catch((caught: unknown) => {
      if (generationRef.current !== generation || queryIdentityRef.current !== queryIdentity) return;
      setError(historyLoadError(caught, "입출고 내역을 불러오지 못했습니다."));
      loadingRef.current = false;
      setLoading(false);
    });
    // queryIdentity contains every primitive query condition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryIdentity, queryClient, retryNonce, realtimeRevision]);

  const retry = useCallback(() => {
    retryQueryIdentityRef.current = queryIdentity;
    setError(null);
    loadingRef.current = true;
    setLoading(true);
    setRetryNonce((value) => value + 1);
  }, [queryIdentity]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || loadingMoreRef.current || !hasMoreRef.current || !cursorRef.current) return;
    const generation = generationRef.current;
    const cursor = cursorRef.current;
    const identity = queryIdentity;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const params = pageParams(cursor);
      const page = await queryClient.fetchQuery({
        queryKey: queryKeys.transactions.displayGroups(params),
        queryFn: ({ signal }) => productionApi.getTransactionDisplayGroups(params, { signal }),
        staleTime: STALE_TIME.VOLATILE,
      });
      if (generationRef.current !== generation || queryIdentityRef.current !== identity) return;
      cursorRef.current = page.nextCursor;
      hasMoreRef.current = page.hasMore;
      loadedPageCountRef.current += 1;
      loadedTailGroupKeyRef.current = page.groups.at(-1)?.key ?? loadedTailGroupKeyRef.current;
      setGroups((previous) => [...previous, ...page.groups]);
      setHasMore(page.hasMore);
    } catch (caught: unknown) {
      if (generationRef.current === generation && queryIdentityRef.current === identity) {
        setLoadMoreError(historyLoadError(caught, "추가 내역을 불러오지 못했습니다."));
      }
    } finally {
      if (generationRef.current === generation && queryIdentityRef.current === identity) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operationKeys, dateFrom, dateTo, search, departmentParam, modelParam, queryIdentity, queryClient]);

  return {
    groups,
    setGroups,
    loading,
    error,
    retry,
    loadingMore,
    loadMoreError,
    canLoadMore: !loading && hasMore,
    loadMore,
  };
}
