"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type TransactionLog } from "@/lib/api";

const PAGE_SIZE = 100;

// 5.5-F: AbortController 마이그 — 빠른 refetch 충돌 시 마지막 결과만 반영.
// (CONTRACT.md 의 list hook 표준 패턴)
export function useTransactions() {
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const activeCtrlRef = useRef<AbortController | null>(null);

  const refetch = useCallback(async () => {
    activeCtrlRef.current?.abort();
    const ctrl = new AbortController();
    activeCtrlRef.current = ctrl;
    setLoading(true);
    try {
      const data = await api.getTransactions({ limit: PAGE_SIZE, skip: 0 }, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      setLogs(data);
      setHasMore(data.length === PAGE_SIZE);
      setPage(1);
      setError(null);
    } catch (err) {
      if ((err as Error)?.name === "AbortError" || ctrl.signal.aborted) return;
      setError(err instanceof Error ? err.message : "이력을 불러오지 못했습니다.");
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
    return () => activeCtrlRef.current?.abort();
  }, [refetch]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return;
    // 5.6-B: 이전 inflight (refetch 또는 loadMore) 가 있으면 취소 + ref 보관 →
    // unmount cleanup (useEffect) 에서 동일 ref 로 abort 가능.
    activeCtrlRef.current?.abort();
    const ctrl = new AbortController();
    activeCtrlRef.current = ctrl;
    const next = page + 1;
    setPage(next);
    setLoading(true);
    try {
      const data = await api.getTransactions(
        { limit: PAGE_SIZE, skip: (next - 1) * PAGE_SIZE },
        { signal: ctrl.signal },
      );
      if (ctrl.signal.aborted) return;
      setLogs((prev) => [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      if ((err as Error)?.name === "AbortError" || ctrl.signal.aborted) return;
      setError(err instanceof Error ? err.message : "이력을 불러오지 못했습니다.");
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [hasMore, loading, page]);

  return { logs, loading, error, hasMore, refetch, loadMore };
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
