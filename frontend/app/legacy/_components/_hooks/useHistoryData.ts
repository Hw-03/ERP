"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type TransactionLog } from "@/lib/api";
import {
  HISTORY_PAGE_SIZE,
  TRANSACTION_TYPES_NONE,
  dateFilterToFrom,
  intersectTransactionTypes,
  type HistoryScope,
} from "../_history_sections/historyShared";

export interface UseHistoryDataArgs {
  scope: HistoryScope;
  typeFilter: string;
  dateFilter: string;
  /** 부모(DesktopHistoryView)에서 350ms debounce 후 set 한 값. 목록/달력이 같은 값을 공유. */
  debouncedSearch: string;
  /** 달력에서 선택한 날짜 (YYYY-MM-DD). 있으면 dateFilter 무시하고 그날만 fetch. */
  selectedDateKey: string | null;
}

export interface UseHistoryDataResult {
  logs: TransactionLog[];
  setLogs: React.Dispatch<React.SetStateAction<TransactionLog[]>>;
  loading: boolean;
  loadingMore: boolean;
  canLoadMore: boolean;
  loadMore: () => Promise<void>;
}

/**
 * 서버사이드 필터로 입출고 내역을 페이지네이션 조회.
 * - scope/typeFilter/dateFilter/debouncedSearch 변경 시 logs 초기화 + 재조회.
 * - canLoadMore = 마지막 응답 길이 === HISTORY_PAGE_SIZE.
 * - "__NONE__" 교집합이면 fetch 생략하고 빈 배열.
 * - loadMore 중 조건이 바뀌면 stale 응답을 logs 에 append 하지 않음 (queryKey ref 가드).
 */
export function useHistoryData({
  scope,
  typeFilter,
  dateFilter,
  debouncedSearch,
  selectedDateKey,
}: UseHistoryDataArgs): UseHistoryDataResult {
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastBatchSize, setLastBatchSize] = useState<number | null>(null);
  const skipRef = useRef(0);

  const transactionTypes = intersectTransactionTypes(scope, typeFilter);
  // selectedDateKey 가 있으면 dateFilter 를 무시하고 그날 단일로 좁힌다.
  const dateFrom = selectedDateKey ?? dateFilterToFrom(dateFilter);
  const dateTo = selectedDateKey ?? undefined;
  const search = debouncedSearch.trim() || undefined;

  // queryKey: 조건 변화를 한 문자열로. stale 응답 가드용.
  const queryKey = `${transactionTypes ?? ""}|${dateFrom ?? ""}|${dateTo ?? ""}|${search ?? ""}`;
  const queryKeyRef = useRef(queryKey);
  // loadMore 가 사용하는 abort controller. 새 조건 effect 발동 시 abort.
  const loadMoreCtrlRef = useRef<AbortController | null>(null);

  // 조건 변화 → 초기화 + 재조회
  useEffect(() => {
    queryKeyRef.current = queryKey;
    skipRef.current = 0;
    setLogs([]);
    setLastBatchSize(null);

    // 진행 중이던 더보기 요청 abort.
    loadMoreCtrlRef.current?.abort();
    loadMoreCtrlRef.current = null;

    if (transactionTypes === TRANSACTION_TYPES_NONE) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const ctrl = new AbortController();
    const myKey = queryKey;
    void api
      .getTransactions(
        {
          limit: HISTORY_PAGE_SIZE,
          skip: 0,
          transactionTypes,
          dateFrom,
          dateTo,
          search,
        },
        { signal: ctrl.signal },
      )
      .then((data) => {
        if (queryKeyRef.current !== myKey) return; // stale
        setLogs(data);
        setLastBatchSize(data.length);
        setLoading(false);
      })
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        if (queryKeyRef.current !== myKey) return;
        setLoading(false);
      });
    return () => ctrl.abort();
    // primitive 분해된 query string 으로 비교하므로 안전.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  const loadMore = useCallback(async () => {
    if (transactionTypes === TRANSACTION_TYPES_NONE) return;
    const myKey = queryKey;
    const nextSkip = skipRef.current + HISTORY_PAGE_SIZE;
    setLoadingMore(true);
    const ctrl = new AbortController();
    loadMoreCtrlRef.current = ctrl;
    try {
      const more = await api.getTransactions(
        {
          limit: HISTORY_PAGE_SIZE,
          skip: nextSkip,
          transactionTypes,
          dateFrom,
          dateTo,
          search,
        },
        { signal: ctrl.signal },
      );
      if (queryKeyRef.current !== myKey) return; // stale — append 금지
      skipRef.current = nextSkip;
      setLogs((prev) => [...prev, ...more]);
      setLastBatchSize(more.length);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      // 다른 에러는 무시 — 다음 시도에서 재요청 가능.
    } finally {
      // current key 와 일치할 때만 loadingMore 내림 (stale 시엔 새 effect 가 처리).
      if (queryKeyRef.current === myKey) setLoadingMore(false);
      if (loadMoreCtrlRef.current === ctrl) loadMoreCtrlRef.current = null;
    }
  }, [transactionTypes, dateFrom, dateTo, search, queryKey]);

  const canLoadMore = lastBatchSize === HISTORY_PAGE_SIZE;

  return { logs, setLogs, loading, loadingMore, canLoadMore, loadMore };
}
