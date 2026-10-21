"use client";

// W5: MasterItems 도메인 List sub-hook.
// 책임: 품목 목록 + 검색 키워드 + 필터링된 visibleItems.

import { useMemo } from "react";
import { useAdminSessionState } from "./useAdminSessionState";
import type { Item } from "@/lib/api";
import { useItemSearch } from "@/lib/queries/useItemSearch";

export type ItemFilter = {
  itemSearch: string;
  globalSearch: string;
};

export type UseAdminMasterItemsListArgs = {
  items: Item[];
  /** 외부에서 주입되는 글로벌 검색 (상단 헤더 등) */
  globalSearch: string;
};

export type UseAdminMasterItemsListState = {
  items: Item[];
  itemSearch: string;
  setItemSearch: (v: string) => void;
  filter: ItemFilter;
  visibleItems: Item[];
  canReorderItems: boolean;
};

export function useAdminMasterItemsList({
  items,
  globalSearch,
}: UseAdminMasterItemsListArgs): UseAdminMasterItemsListState {
  const { matchesItem } = useItemSearch();
  const [itemSearch, setItemSearch] = useAdminSessionState<string>("items.search", "");
  const hasSearch = Boolean(`${globalSearch} ${itemSearch}`.trim());

  const visibleItems = useMemo(() => {
    const keyword = `${globalSearch} ${itemSearch}`.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) => matchesItem(item, keyword));
  }, [globalSearch, itemSearch, items, matchesItem]);

  return {
    items,
    itemSearch,
    setItemSearch,
    filter: { itemSearch, globalSearch },
    visibleItems,
    canReorderItems: !hasSearch,
  };
}
