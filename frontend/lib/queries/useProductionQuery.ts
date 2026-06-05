"use client";

/**
 * Production 도메인 React Query hook — W7-9.
 *
 * productionApi 기반. 생산 영수증·BOM 체크·트랜잭션 내역·편집 이력 묶음.
 * 인터페이스 ≤ 6:
 *   useProductionCapacityQuery / useTransactionsQuery /
 *   useTransactionEditsQuery / useProductionReceiptMutation /
 *   useMetaEditTransactionMutation / useQuantityCorrectMutation
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { productionApi } from "@/lib/api/production";
import { queryKeys } from "./keys";

/** 생산 가능량 조회 */
export function useProductionCapacityQuery() {
  return useQuery({
    queryKey: queryKeys.production.capacity(),
    queryFn: () => productionApi.getProductionCapacity(),
  });
}

/** 입출고 트랜잭션 목록 */
export function useTransactionsQuery(
  params?: Parameters<typeof productionApi.getTransactions>[0],
) {
  return useQuery({
    queryKey: queryKeys.production.transactions(
      params as Record<string, unknown> | undefined,
    ),
    queryFn: () => productionApi.getTransactions(params),
  });
}

/** 특정 트랜잭션 수정 이력 */
export function useTransactionEditsQuery(logId: string) {
  return useQuery({
    queryKey: queryKeys.production.transactionEdits(logId),
    queryFn: () => productionApi.getTransactionEdits(logId),
    enabled: !!logId,
  });
}

/** 생산 입고 등록 */
export function useProductionReceiptMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      payload: Parameters<typeof productionApi.productionReceipt>[0],
    ) => productionApi.productionReceipt(payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.production.all }),
  });
}

/** 트랜잭션 메타 수정 (notes / reference_no / produced_by) */
export function useMetaEditTransactionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      logId,
      payload,
    }: {
      logId: string;
      payload: Parameters<typeof productionApi.metaEditTransaction>[1];
    }) => productionApi.metaEditTransaction(logId, payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.production.all }),
  });
}

/** 트랜잭션 수량 보정 */
export function useQuantityCorrectMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      logId,
      payload,
    }: {
      logId: string;
      payload: Parameters<typeof productionApi.quantityCorrectTransaction>[1];
    }) => productionApi.quantityCorrectTransaction(logId, payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.production.all }),
  });
}
