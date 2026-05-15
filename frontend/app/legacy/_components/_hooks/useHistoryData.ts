"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type TransactionLog } from "@/lib/api";
import {
  HISTORY_PAGE_SIZE,
  TRANSACTION_TYPES_NONE,
  getPeriodStart,
  intersectTransactionTypes,
  type HistoryScope,
} from "../_history_sections/historyShared";

export interface UseHistoryDataArgs {
  scope: HistoryScope;
  typeFilter: string;
  dateFilter: string;
  /** 부모(DesktopHistoryView)에서 350ms debounce 후 set 한 값. 목록/달력이 같은 값을 공유. */
  debouncedSearch: string;
}

export interface UseHistoryDataResult {
  logs: TransactionLog[];
  setLogs: React.Dispatch<React.SetStateAction<TransactionLog[]>>;
  loading: boolean;
  loadingMore: boolean;
  canLoadMore: boolean;
  loadMore: () => Promise<void>;
}

function dateFilterToFrom(dateFilter: string): string | undefined {
  const d = getPeriodStart(dateFilter);
  if (!d) return undefined;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * 서버사이드 필터로 입출고 내역을 페이지네이션 조회.
 * - scope/typeFilter/dateFilter/debouncedSearch 변경 시 logs 초기화 + 재조회.
 * - canLoadMore = 마지막 응답 길이 === HISTORY_PAGE_SIZE.
 * - "__NONE__" 교집합이면 fetch 생략하고 빈 배열.
 */
export function useHistoryData({
  scope,
  typeFilter,
  dateFilter,
  debouncedSearch,
}: UseHistoryDataArgs): UseHistoryDataResult {
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastBatchSize, setLastBatchSize] = useState<number | null>(null);
  const skipRef = useRef(0);

  const transactionTypes = intersectTransactionTypes(scope, typeFilter);
  const dateFrom = dateFilterToFrom(dateFilter);
  const search = debouncedSearch.trim() || undefined;

  // 조건 변화 → 초기화 + 재조회
  useEffect(() => {
    skipRef.current = 0;
    setLogs([]);
    setLastBatchSize(null);

    if (transactionTypes === TRANSACTION_TYPES_NONE) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const ctrl = new AbortController();
    void api
      .getTransactions(
        {
          limit: HISTORY_PAGE_SIZE,
          skip: 0,
          transactionTypes,
          dateFrom,
          search,
        },
        { signal: ctrl.signal },
      )
      .then((data) => {
        setLogs(data);
        setLastBatchSize(data.length);
        setLoading(false);
      })
      .catch((err) => {
        if ((err as Error)?.name !== "AbortError") setLoading(false);
      });
    return () => ctrl.abort();
    // transactionTypes/dateFrom/search 가 객체/undefined 라 의존성 안전하게 primitive 로 분해
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionTypes, dateFrom, search]);

  const loadMore = useCallback(async () => {
    if (transactionTypes === TRANSACTION_TYPES_NONE) return;
    const nextSkip = skipRef.current + HISTORY_PAGE_SIZE;
    setLoadingMore(true);
    try {
      const more = await api.getTransactions({
        limit: HISTORY_PAGE_SIZE,
        skip: nextSkip,
        transactionTypes,
        dateFrom,
        search,
      });
      skipRef.current = nextSkip;
      setLogs((prev) => [...prev, ...more]);
      setLastBatchSize(more.length);
    } finally {
      setLoadingMore(false);
    }
  }, [transactionTypes, dateFrom, search]);

  const canLoadMore = lastBatchSize === HISTORY_PAGE_SIZE;

  return { logs, setLogs, loading, loadingMore, canLoadMore, loadMore };
}
