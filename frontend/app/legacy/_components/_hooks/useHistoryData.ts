"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type TransactionLog } from "@/lib/api";
import { HISTORY_PAGE_SIZE, TAB_TYPE_MAP, type HistoryTab } from "../_history_sections/historyShared";

export interface UseHistoryDataResult {
  logs: TransactionLog[];
  setLogs: React.Dispatch<React.SetStateAction<TransactionLog[]>>;
  page: number;
  loading: boolean;
  loadingMore: boolean;
  canLoadMore: boolean;
  loadMore: () => Promise<void>;
}

export function useHistoryData(historyTab: HistoryTab = "ALL"): UseHistoryDataResult {
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // 탭 변경 시 초기화 후 재조회
  useEffect(() => {
    setLogs([]);
    setPage(1);
    setLoading(true);
    const ctrl = new AbortController();
    void api
      .getTransactions(
        { limit: HISTORY_PAGE_SIZE, skip: 0, transactionTypes: TAB_TYPE_MAP[historyTab] },
        { signal: ctrl.signal },
      )
      .then((data) => {
        setLogs(data);
        setLoading(false);
      })
      .catch((err) => {
        if ((err as Error)?.name !== "AbortError") setLoading(false);
      });
    return () => ctrl.abort();
  }, [historyTab]);

  const loadMore = useCallback(async () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const more = await api.getTransactions({
        limit: HISTORY_PAGE_SIZE,
        skip: (nextPage - 1) * HISTORY_PAGE_SIZE,
        transactionTypes: TAB_TYPE_MAP[historyTab],
      });
      setLogs((prev) => [...prev, ...more]);
      setPage(nextPage);
    } finally {
      setLoadingMore(false);
    }
  }, [page, historyTab]);

  const canLoadMore = logs.length >= page * HISTORY_PAGE_SIZE;

  return { logs, setLogs, page, loading, loadingMore, canLoadMore, loadMore };
}
