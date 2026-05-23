"use client";

/**
 * BOM 도메인 React Query hook — W7-5.
 *
 * catalogApi의 BOM 관련 메서드를 React Query로 래핑.
 * reference 패턴: useModelsQuery.ts
 *
 * 3 query + 3 mutation:
 *   useBomQuery(parentId?) — 전체 BOM 목록 또는 특정 parentId의 BOM
 *   useBomTreeQuery(parentId) — BOM 트리
 *   useBomWhereUsedQuery(itemId) — 역방향 조회
 *   useCreateBomMutation — BOM 행 추가
 *   useUpdateBomMutation — BOM 행 수정
 *   useDeleteBomMutation — BOM 행 삭제
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { catalogApi } from "@/lib/api/catalog";
import { queryKeys } from "./keys";

/** parentId 없음: getAllBOM (BOMDetailEntry[]) */
export function useBomListQuery() {
  return useQuery({
    queryKey: queryKeys.bom.list(),
    queryFn: () => catalogApi.getAllBOM(),
  });
}

/** parentId 지정: getBOM (BOMEntry[]) */
export function useBomQuery(parentId: string) {
  return useQuery({
    queryKey: queryKeys.bom.detail(parentId),
    queryFn: () => catalogApi.getBOM(parentId),
    enabled: Boolean(parentId),
  });
}

export function useBomTreeQuery(parentId: string) {
  return useQuery({
    queryKey: queryKeys.bom.tree(parentId),
    queryFn: () => catalogApi.getBOMTree(parentId),
    enabled: Boolean(parentId),
  });
}

export function useBomWhereUsedQuery(itemId: string) {
  return useQuery({
    queryKey: queryKeys.bom.whereUsed(itemId),
    queryFn: () => catalogApi.getBOMWhereUsed(itemId),
    enabled: Boolean(itemId),
  });
}

export function useCreateBomMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof catalogApi.createBOM>[0]) =>
      catalogApi.createBOM(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bom.all }),
  });
}

export function useUpdateBomMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      bomId,
      payload,
    }: {
      bomId: string;
      payload: Parameters<typeof catalogApi.updateBOM>[1];
    }) => catalogApi.updateBOM(bomId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bom.all }),
  });
}

export function useDeleteBomMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bomId: string) => catalogApi.deleteBOM(bomId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bom.all }),
  });
}
