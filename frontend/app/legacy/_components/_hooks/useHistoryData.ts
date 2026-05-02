"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type TransactionLog } from "@/lib/api";
import { HISTORY_PAGE_SIZE } from "../_history_sections/historyShared";

/**
 * History 페이지의 거래 로그 fetch 상태 + pagination 훅.
 *
 * Round-7 (R7-HOOK1) 추출. DesktopHistoryView 의 logs/page/loading/loadingMore
 * 상태와 초기 fetch / loadMore 로직만 묶었다. mutation handler (handleLogUpdated,
 * handleLogCorrected) 는 setLogs 를 통해 외부에서 처리.
 *
 * fetch 타이밍은 기존과 동일 (mount 시 1회 + loadMore 호출 시).
 */
export interface UseHistoryDataResult {
  logs: TransactionLog[];
  setLogs: React.Dispatch<React.SetStateAction<TransactionLog[]>>;
  page: number;
  loading: boolean;
  loadingMore: boolean;
  canLoadMore: boolean;
  loadMore: () => Promise<void>;
}

export function useHistoryData(): UseHistoryDataResult {
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // 초기 fetch — mount 시 1회 (기존 동작 보존)
  useEffect(() => {
    setLoading(true);
    void api
      .getTransactions({ limit: HISTORY_PAGE_SIZE, skip: 0 })
      .then((data) => {
        setLogs(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const loadMore = useCallback(async () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const more = await api.getTransactions({
        limit: HISTORY_PAGE_SIZE,
        skip: (nextPage - 1) * HISTORY_PAGE_SIZE,
      });
      setLogs((prev) => [...prev, ...more]);
      setPage(nextPage);
    } finally {
      setLoadingMore(false);
    }
  }, [page]);

  const canLoadMore = logs.length >= page * HISTORY_PAGE_SIZE;

  return { logs, setLogs, page, loading, loadingMore, canLoadMore, loadMore };
}
