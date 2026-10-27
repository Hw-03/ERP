"use client";

/**
 * BOM 도메인 React Query hook — W7-5.
 *
 * catalogApi의 BOM 관련 메서드를 React Query로 래핑.
 * reference 패턴: useModelsQuery.ts
 *
 * query + mutation:
 *   useBomListQuery — 전체 BOM 목록
 *   useBomParentIdsQuery — 입출고 BOM 부모 ID 목록
 *   useBomQuery(parentId) — 특정 parentId의 BOM
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

/** 잘못된 응답을 빈 BOM 집합으로 취급해 낱개 작업으로 오판하지 않도록 한다. */
function assertBomParentIds(ids: unknown): asserts ids is string[] {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !id.trim())) {
    throw new BomListResponseError();
  }
}

/** 전체 목록과 부모 ID 조회가 동일한 시간 제한·취소·응답 오류 정책을 공유한다. */
async function fetchBomList<T>(
  signal: AbortSignal,
  fetchRows: (signal: AbortSignal) => Promise<T>,
  assertRows: (rows: unknown) => asserts rows is T,
): Promise<T> {
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
    const rows = await fetchRows(controller.signal);
    assertRows(rows);
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
export function useBomListQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.bom.list(),
    queryFn: ({ signal }) => fetchBomList(signal, catalogApi.getAllBOM, assertBomList),
    enabled: options?.enabled,
    retry: (failureCount, error) => failureCount < 1 && shouldRetryBomList(error),
    retryDelay: () => BOM_LIST_RETRY_DELAY_MS,
  });
}

/** 입출고 BOM 유무 판별에 필요한 전체 부모 ID 목록. */
export function useBomParentIdsQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.bom.parentIds(),
    queryFn: ({ signal }) => fetchBomList(signal, catalogApi.getBOMParentIds, assertBomParentIds),
    enabled: options?.enabled,
    retry: (failureCount, error) => failureCount < 1 && shouldRetryBomList(error),
    retryDelay: () => BOM_LIST_RETRY_DELAY_MS,
  });
}

/** parentId 지정: getBOM (BOMEntry[]) */
export function useBomQuery(parentId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.bom.detail(parentId),
    queryFn: ({ signal }) => catalogApi.getBOM(parentId, signal),
    enabled: Boolean(parentId) && options?.enabled !== false,
  });
}

export function useBomTreeQuery(parentId: string) {
  return useQuery({
    queryKey: queryKeys.bom.tree(parentId),
    queryFn: () => catalogApi.getBOMTree(parentId),
    enabled: Boolean(parentId),
  });
}

export function useBomWhereUsedQuery(itemId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.bom.whereUsed(itemId),
    queryFn: ({ signal }) => catalogApi.getBOMWhereUsed(itemId, signal),
    enabled: Boolean(itemId) && options?.enabled !== false,
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
