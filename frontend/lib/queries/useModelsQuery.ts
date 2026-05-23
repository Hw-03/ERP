"use client";

/**
 * Models 도메인 React Query hook — W4-A reference.
 *
 * 1 query + 4 mutation 패턴. 모든 mutation은 성공 시
 * `queryKeys.models.all`을 invalidate해서 list/detail을 동시에 refetch한다.
 *
 * 다른 도메인 마이그레이션 시 이 파일을 참조해 동일 구조로 작성한다.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { catalogApi } from "@/lib/api/catalog";
import { queryKeys } from "./keys";

export function useModelsQuery() {
  return useQuery({
    queryKey: queryKeys.models.list(),
    queryFn: () => catalogApi.getModels(),
  });
}

export function useCreateModelMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof catalogApi.createModel>[0]) =>
      catalogApi.createModel(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.models.all }),
  });
}

export function useUpdateModelMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      slot,
      payload,
    }: {
      slot: number;
      payload: Parameters<typeof catalogApi.updateModel>[1];
    }) => catalogApi.updateModel(slot, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.models.all }),
  });
}

export function useDeleteModelMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slot, pin }: { slot: number; pin: string }) =>
      catalogApi.deleteModel(slot, pin),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.models.all }),
  });
}

export function useReorderModelsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof catalogApi.reorderModels>[0]) =>
      catalogApi.reorderModels(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.models.all }),
  });
}
