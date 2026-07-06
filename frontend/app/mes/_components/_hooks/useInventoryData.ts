"use client";

import { useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Item } from "@/lib/api";
import { useItemsQuery } from "@/lib/queries/useItemsQuery";
import { queryKeys } from "@/lib/queries/keys";

/**
 * Inventory 페이지의 items fetch 상태 + selected item 동기화 훅.
 *
 * Round-7 (R7-HOOK2) 추출. DesktopInventoryView 의 items/loading/error
 * 상태와 loadItems 함수만 묶었다. selectedItem 은 컴포넌트 외부 (UI 상호작용)
 * 와 결합도가 높아 그대로 둔다 — 다만 setSelectedItem 호출이 필요하므로
 * 외부에서 setter 를 전달.
 *
 * fetch 타이밍은 기존과 동일 (globalSearch / onStatusChange 변화 시).
 *
 * 좌측 사이드바 탭 전환 flicker 수정: React Query(useItemsQuery)로 이관.
 * 탭 전환으로 이 훅이 리마운트돼도 QueryClient 캐시(전역 staleTime 5분)가
 * 컴포넌트 트리 밖에 살아있어 재요청/로딩 플래시 없이 즉시 렌더된다.
 * 반환 시그니처는 이관 전과 동일하게 유지해 호출부는 무변경.
 */
export interface UseInventoryDataOptions {
  globalSearch: string;
  onStatusChange: (status: string) => void;
  onSelectedSync?: (next: Item[]) => void;
}

export interface UseInventoryDataResult {
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  loading: boolean;
  error: string | null;
  loadItems: () => Promise<void>;
}

export function useInventoryData(opts: UseInventoryDataOptions): UseInventoryDataResult {
  const { globalSearch, onStatusChange, onSelectedSync } = opts;
  const queryClient = useQueryClient();
  const search = globalSearch.trim() || undefined;
  const query = useItemsQuery({ limit: 2000, search });
  const items = query.data ?? [];

  useEffect(() => {
    // selected item 의 최신 본문 동기화는 호출자가 처리 (selectedItem 의존)
    if (query.data) onSelectedSync?.(query.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  useEffect(() => {
    if (!query.error) return;
    const message = query.error instanceof Error ? query.error.message : "재고 데이터를 불러오지 못했습니다.";
    onStatusChange(message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.error]);

  useEffect(() => {
    const onItems = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.items.all });
    };
    window.addEventListener("items", onItems);
    return () => window.removeEventListener("items", onItems);
  }, [queryClient]);

  const loadItems = useCallback(async () => {
    await query.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.refetch]);

  const setItems: React.Dispatch<React.SetStateAction<Item[]>> = useCallback(
    (next) => {
      queryClient.setQueryData<Item[]>(queryKeys.items.list({ limit: 2000, search }), (prev) =>
        typeof next === "function" ? (next as (prev: Item[]) => Item[])(prev ?? []) : next,
      );
    },
    [queryClient, search],
  );

  const error = query.error
    ? query.error instanceof Error
      ? query.error.message
      : "재고 데이터를 불러오지 못했습니다."
    : null;

  return { items, setItems, loading: query.isLoading, error, loadItems };
}
