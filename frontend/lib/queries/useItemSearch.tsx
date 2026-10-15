"use client";
import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { EMPTY_ITEM_SEARCH_CONFIG, type ItemSearchConfig } from "../api/types/item-search";
import { itemSearchApi } from "../api/item-search";
import { matchesItemSearch, matchesItemSearchFields, type ItemSearchItem, type ItemSearchFields } from "../itemSearch";
import { queryKeys } from "./keys";
import { ApiError } from "../api-core";

interface SearchConfigState { config: ItemSearchConfig; ready: boolean; error: string | null; retry: () => void; save: (operation: () => Promise<unknown>) => Promise<void> }
const SearchConfigContext = createContext<SearchConfigState>({ config: EMPTY_ITEM_SEARCH_CONFIG, ready: true, error: null, retry: () => {}, save: async (operation) => { await operation(); } });
export const itemSearchConfigOptions = {
  queryKey: queryKeys.itemSearch.config(), queryFn: itemSearchApi.getConfig, staleTime: 0,
};
/** One shared metadata snapshot feeds every search without changing item DTOs. */
export function SearchConfigProvider({ children }: { children: ReactNode }) {
  const query = useQuery(itemSearchConfigOptions);
  const { refetch } = query;
  const retry = useCallback((): void => { void refetch(); }, [refetch]);
  async function save(operation: () => Promise<unknown>): Promise<void> {
    try { await operation(); }
    catch (failure) {
      if (failure instanceof ApiError && failure.isConflict) await query.refetch();
      throw failure;
    }
    await query.refetch();
  }
  return <SearchConfigContext.Provider value={{ config: query.data ?? EMPTY_ITEM_SEARCH_CONFIG, ready: query.data !== undefined,
    error: query.error ? query.error instanceof Error ? query.error.message : "검색 설정을 불러오지 못했습니다." : null,
    retry, save }}>{children}</SearchConfigContext.Provider>;
}
export function useItemSearchSave() { return useContext(SearchConfigContext).save; }
/** Context-only access also permits existing isolated component consumers. */
export function useItemSearch() {
  const state = useContext(SearchConfigContext);
  const { config } = state;
  const matchesItem = useCallback((item: ItemSearchItem, query: string): boolean => matchesItemSearch(item, query, config), [config]);
  const matchesFields = useCallback((fields: ItemSearchFields, query: string): boolean => matchesItemSearchFields(fields, query, config), [config]);
  return { ...state, matchesItem, matchesFields };
}
