"use client";

/**
 * Items 도메인 React Query hook — W7-3.
 *
 * useItemsQuery + useItemQuery + 3 mutation. mutation 성공 시
 * `queryKeys.items.all` invalidate.
 *
 * useModelsQuery.ts 패턴을 그대로 따른다.
 * 쿼리 파라미터(process_type_code 등)는 itemsApi.getItems에 그대로 위임.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { itemsApi } from "@/lib/api/items";
import { queryKeys } from "./keys";

export function useItemsQuery(params?: Parameters<typeof itemsApi.getItems>[0]) {
  return useQuery({
    queryKey: queryKeys.items.list(params),
    queryFn: ({ signal }) => itemsApi.getItems(params, { signal }),
  });
}

export function useItemQuery(itemId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.items.detail(itemId ?? ""),
    queryFn: () => itemsApi.getItem(itemId as string),
    enabled: !!itemId,
  });
}

export function useCreateItemMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof itemsApi.createItem>[0]) =>
      itemsApi.createItem(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.items.all }),
  });
}

export function useUpdateItemMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      payload,
    }: {
      itemId: string;
      payload: Parameters<typeof itemsApi.updateItem>[1];
    }) => itemsApi.updateItem(itemId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.items.all }),
  });
}

export function useUpdateBomCompletionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, completed }: { itemId: string; completed: boolean }) =>
      itemsApi.updateBomCompletion(itemId, completed),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.items.all }),
  });
}
