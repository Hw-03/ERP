"use client";

import { useEffect, useRef } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData, type UseInfiniteQueryResult } from "@tanstack/react-query";
import { productionApi, type TransactionDisplayGroupPage } from "@/lib/api/production";
import { STALE_TIME } from "./client";
import { queryKeys } from "./keys";
import { useRealtimeRevision } from "./realtime";

const ITEM_HISTORY_PAGE_SIZE = 10;

/** 품목의 전체 기간 이력을 작업 단위로 조회하고 실시간 무효화 시 읽은 페이지도 갱신한다. */
export function useItemHistoryPagesQuery(itemId: string): UseInfiniteQueryResult<InfiniteData<TransactionDisplayGroupPage>, Error> {
  const queryClient = useQueryClient();
  const revision = useRealtimeRevision();
  const previousRevision = useRef(revision);
  useEffect(() => {
    const changed = previousRevision.current !== revision;
    previousRevision.current = revision;
    if (!changed) return;
    const queryKey = queryKeys.transactions.itemHistoryPages(itemId);
    const state = queryClient.getQueryState(queryKey);
    // 최초 조회에는 data가 없어 일반 invalidate가 진행 요청을 재사용한다. 명시적으로 다시 시작한다.
    if (state?.data !== undefined || state?.fetchStatus !== "fetching") {
      // 변경 전 최초 응답이 효과 실행보다 먼저 도착한 경우도 갱신한다. 진행 중인 갱신은 재사용한다.
      void queryClient.invalidateQueries({ queryKey, exact: true }, { cancelRefetch: false });
      return;
    }
    let disposed = false;
    void queryClient.cancelQueries({ queryKey, exact: true }).then(() => {
      if (!disposed) return queryClient.invalidateQueries({ queryKey, exact: true });
    });
    return () => { disposed = true; };
  }, [itemId, revision, queryClient]);

  return useInfiniteQuery({
    queryKey: queryKeys.transactions.itemHistoryPages(itemId),
    queryFn: ({ pageParam, signal }) => productionApi.getTransactionDisplayGroups({
      itemId, limit: ITEM_HISTORY_PAGE_SIZE, cursor: pageParam,
    }, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.hasMore ? page.nextCursor ?? undefined : undefined,
    staleTime: STALE_TIME.VOLATILE,
  });
}
