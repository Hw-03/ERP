"use client";

import { useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type Item, type ProductModel } from "@/lib/api";
import { useModelsQuery } from "@/lib/queries/useModelsQuery";
import { useItemsQuery } from "@/lib/queries/useItemsQuery";
import { useEmployeesQuery } from "@/lib/queries/useEmployeesQuery";
import { queryKeys } from "@/lib/queries/keys";

const EMPTY_MODELS: ProductModel[] = [];

type Args = {
  globalSearch: string;
  onStatusChange: (status: string) => void;
};

/**
 * 좌측 사이드바 탭 전환 flicker/lag 수정: items/employees 를 React Query
 * (useItemsQuery/useEmployeesQuery)로 이관 — productModels 가 이미
 * useModelsQuery 로 통합된 전례를 그대로 따른다. 탭 전환으로 이 훅이
 * 리마운트돼도 QueryClient 캐시가 살아있어 재요청 없이 즉시 렌더된다.
 * 반환 시그니처는 이관 전과 동일하게 유지해 호출부는 무변경.
 */
export function useWarehouseData({ globalSearch, onStatusChange }: Args) {
  const queryClient = useQueryClient();
  const search = globalSearch.trim() || undefined;

  const { data: productModels, error: modelsError } = useModelsQuery();
  useEffect(() => {
    if (!modelsError) return;
    const msg = modelsError instanceof Error ? modelsError.message : "모델 목록을 불러오지 못했습니다.";
    onStatusChange(msg);
  }, [modelsError, onStatusChange]);

  const itemsQuery = useItemsQuery({ limit: 2000, search });
  const employeesQuery = useEmployeesQuery({ activeOnly: true });

  useEffect(() => {
    const error = itemsQuery.error ?? employeesQuery.error;
    if (!error) return;
    const msg = error instanceof Error ? error.message : "입출고 데이터를 불러오지 못했습니다.";
    onStatusChange(msg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsQuery.error, employeesQuery.error]);

  useEffect(() => {
    const onItems = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.items.all });
    };
    window.addEventListener("items", onItems);
    return () => window.removeEventListener("items", onItems);
  }, [queryClient]);

  const setItems: React.Dispatch<React.SetStateAction<Item[]>> = useCallback(
    (next) => {
      queryClient.setQueryData<Item[]>(queryKeys.items.list({ limit: 2000, search }), (prev) =>
        typeof next === "function" ? (next as (prev: Item[]) => Item[])(prev ?? []) : next,
      );
    },
    [queryClient, search],
  );

  const loadFailureError = itemsQuery.error ?? employeesQuery.error;
  const loadFailure = loadFailureError
    ? loadFailureError instanceof Error
      ? loadFailureError.message
      : "입출고 데이터를 불러오지 못했습니다."
    : null;

  return {
    employees: employeesQuery.data ?? [],
    items: itemsQuery.data ?? [],
    productModels: productModels ?? EMPTY_MODELS,
    loadFailure,
    loading: itemsQuery.isLoading || employeesQuery.isLoading,
    setItems,
  };
}
