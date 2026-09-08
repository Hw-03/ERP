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
import { ApiError } from "@/lib/api-core";
import type { BOMDetailEntry } from "@/lib/api/types/catalog";
import { queryKeys } from "./keys";

const BOM_LIST_TIMEOUT_MS = 8_000;
const BOM_LIST_RETRY_DELAY_MS = 500;

class BomListTimeoutError extends Error {
  constructor() {
    super("BOM 목록 조회 시간이 초과되었습니다.");
    this.name = "BomListTimeoutError";
  }
}

class BomListResponseError extends Error {
  constructor() {
    super("BOM 목록 응답 형식이 올바르지 않습니다.");
    this.name = "BomListResponseError";
  }
}

function assertBomList(rows: unknown): asserts rows is BOMDetailEntry[] {
  const hasParentItemId = (row: unknown): boolean => {
    if (!row || typeof row !== "object") return false;
    const parentItemId = (row as Record<string, unknown>).parent_item_id;
    return typeof parentItemId === "string" && Boolean(parentItemId.trim());
  };
  if (!Array.isArray(rows) || rows.some((row) => !hasParentItemId(row))) {
    throw new BomListResponseError();
  }
}

async function fetchBomList(signal: AbortSignal): Promise<BOMDetailEntry[]> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, BOM_LIST_TIMEOUT_MS);
  const abortFromQuery = () => controller.abort();
  signal.addEventListener("abort", abortFromQuery, { once: true });
  if (signal.aborted) abortFromQuery();
  try {
    const rows = await catalogApi.getAllBOM(controller.signal);
    assertBomList(rows);
    return rows;
  } catch (error) {
    if (timedOut && !signal.aborted) throw new BomListTimeoutError();
    if (error instanceof SyntaxError) throw new BomListResponseError();
    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal.removeEventListener("abort", abortFromQuery);
  }
}

function shouldRetryBomList(error: unknown): boolean {
  if (error instanceof ApiError) return error.status >= 500;
  if (error instanceof BomListTimeoutError) return true;
  return (error as Error | undefined)?.name !== "AbortError" &&
    (error as Error | undefined)?.name !== "BomListResponseError";
}

/** parentId 없음: getAllBOM (BOMDetailEntry[]) */
export function useBomListQuery() {
  return useQuery({
    queryKey: queryKeys.bom.list(),
    queryFn: ({ signal }) => fetchBomList(signal),
    retry: (failureCount, error) => failureCount < 1 && shouldRetryBomList(error),
    retryDelay: () => BOM_LIST_RETRY_DELAY_MS,
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
