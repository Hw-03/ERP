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

// 5.3-B: 빠른 필터 변경 시 이전 요청을 abort 하여 마지막 결과만 반영. (CONTRACT.md 의 race 처리 패턴)
export function useItems(filters: ItemsFilters) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // 마지막으로 시작된 컨트롤러 (refetch / filter 변경 시 abort)
  const activeCtrlRef = useRef<AbortController | null>(null);

  const filterKey = JSON.stringify(filters);

  const fetchPage = useCallback(
    async (skip: number, append: boolean, ctrl: AbortController) => {
      // 직전 요청 abort — append 가 아닌 새 검색일 때만
      if (!append) {
        activeCtrlRef.current?.abort();
        activeCtrlRef.current = ctrl;
      }
      try {
        setLoading(true);
        const data = await api.getItems(buildParams(filters, skip), { signal: ctrl.signal });
        if (ctrl.signal.aborted) return;
        setItems((prev) => (append ? [...prev, ...data] : data));
        setHasMore(data.length === PAGE_SIZE);
        setError(null);
      } catch (err) {
        if ((err as Error)?.name === "AbortError" || ctrl.signal.aborted) return;
        setError(err instanceof Error ? err.message : "품목을 불러오지 못했습니다.");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filterKey = JSON.stringify(filters) is the derived deps (Cat-A)
    [filterKey],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    setPage(1);
    void fetchPage(0, false, ctrl);
    return () => {
      ctrl.abort();
    };
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    const ctrl = new AbortController();
    void fetchPage((nextPage - 1) * PAGE_SIZE, true, ctrl);
  }, [hasMore, loading, page, fetchPage]);

  const refetch = useCallback(() => {
    const ctrl = new AbortController();
    setPage(1);
    void fetchPage(0, false, ctrl);
  }, [fetchPage]);

  return { items, loading, error, hasMore, loadMore, refetch };
}
