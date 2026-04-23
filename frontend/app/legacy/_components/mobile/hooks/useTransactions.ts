"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type TransactionLog } from "@/lib/api";

const PAGE_SIZE = 100;

export function useTransactions() {
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const reqId = useRef(0);

  const refetch = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const data = await api.getTransactions({ limit: PAGE_SIZE, skip: 0 });
      if (reqId.current === id) {
        setLogs(data);
        setHasMore(data.length === PAGE_SIZE);
        setPage(1);
      }
    } finally {
      if (reqId.current === id) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return;
    const next = page + 1;
    setPage(next);
    const id = ++reqId.current;
    setLoading(true);
    try {
      const data = await api.getTransactions({ limit: PAGE_SIZE, skip: (next - 1) * PAGE_SIZE });
      if (reqId.current === id) {
        setLogs((prev) => [...prev, ...data]);
        setHasMore(data.length === PAGE_SIZE);
      }
    } finally {
      if (reqId.current === id) setLoading(false);
    }
  }, [hasMore, loading, page]);

  return { logs, loading, hasMore, refetch, loadMore };
}

export async function fetchMonthLogs(year: number, month: number): Promise<TransactionLog[]> {
  // Backend does not support month-range filter; fetch a large batch and
  // filter client-side. We scope to 2000 entries which is well past any real
  // month.
  const data = await api.getTransactions({ limit: 2000, skip: 0 });
  return data.filter((log) => {
    const d = new Date(log.created_at.endsWith("Z") ? log.created_at : log.created_at + "Z");
    return d.getFullYear() === year && d.getMonth() === month;
  });
}
