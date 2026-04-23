"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Item } from "@/lib/api";

export type ItemsFilters = {
  search?: string;
  department?: string; // "ALL" or dept code
  legacyModel?: string; // "ALL" or model name
};

const PAGE_SIZE = 100;

function buildParams(filters: ItemsFilters, skip: number) {
  const params: Parameters<typeof api.getItems>[0] = { limit: PAGE_SIZE, skip };
  if (filters.department && filters.department !== "ALL") params.department = filters.department;
  if (filters.legacyModel && filters.legacyModel !== "ALL") params.legacyModel = filters.legacyModel;
  const q = filters.search?.trim();
  if (q) params.search = q;
  return params;
}

export function useItems(filters: ItemsFilters) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const reqId = useRef(0);

  const filterKey = JSON.stringify(filters);

  const fetchPage = useCallback(
    async (skip: number, append: boolean, signalId: number) => {
      try {
        setLoading(true);
        const data = await api.getItems(buildParams(filters, skip));
        if (reqId.current !== signalId) return;
        setItems((prev) => (append ? [...prev, ...data] : data));
        setHasMore(data.length === PAGE_SIZE);
        setError(null);
      } catch (err) {
        if (reqId.current !== signalId) return;
        setError(err instanceof Error ? err.message : "품목을 불러오지 못했습니다.");
      } finally {
        if (reqId.current === signalId) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterKey],
  );

  useEffect(() => {
    const id = ++reqId.current;
    setPage(1);
    void fetchPage(0, false, id);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    const id = ++reqId.current;
    void fetchPage((nextPage - 1) * PAGE_SIZE, true, id);
  }, [hasMore, loading, page, fetchPage]);

  const refetch = useCallback(() => {
    const id = ++reqId.current;
    setPage(1);
    void fetchPage(0, false, id);
  }, [fetchPage]);

  return { items, loading, error, hasMore, loadMore, refetch };
}
