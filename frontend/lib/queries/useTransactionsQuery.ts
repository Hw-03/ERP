"use client";

/**
 * Transactions 도메인 React Query hook — W7-4.
 *
 * productionApi의 transactions 관련 메서드를 React Query로 래핑.
 * reference 패턴: useModelsQuery.ts
 *
 * 1 list query + 1 summary query + 3 mutation:
 *   useTransactionsQuery(params) — 필터 params를 포함한 리스트
 *   useTransactionsSummaryQuery(params) — KPI 카드용 집계
 *   useMetaEditTransactionMutation — 메타 수정
 *   useQuantityCorrectTransactionMutation — 수량 보정
 *   useTransactionEditsQuery(logId) — 수정 이력
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { productionApi } from "@/lib/api/production";
import { STALE_TIME } from "./client";
import { queryKeys } from "./keys";

type TransactionParams = Parameters<typeof productionApi.getTransactions>[0];
type SummaryParams = Parameters<typeof productionApi.getTransactionsSummary>[0];

export function useTransactionsQuery(params?: TransactionParams) {
  return useQuery({
    queryKey: queryKeys.transactions.list(params),
    queryFn: () => productionApi.getTransactions(params),
    // 입출고 내역은 신규 트랜잭션이 자주 추가됨 → 짧게 (R2-1).
    staleTime: STALE_TIME.VOLATILE,
  });
}

export function useTransactionsSummaryQuery(params?: SummaryParams) {
  return useQuery({
    queryKey: queryKeys.transactions.summary(params),
    queryFn: () => productionApi.getTransactionsSummary(params),
    // KPI 집계도 내역과 함께 변동 → 짧게 (R2-1).
    staleTime: STALE_TIME.VOLATILE,
  });
}

export function useTransactionEditsQuery(logId: string) {
  return useQuery({
    queryKey: queryKeys.transactions.edits(logId),
    queryFn: () => productionApi.getTransactionEdits(logId),
    enabled: Boolean(logId),
  });
}

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
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.transactions.all }),
  });
}

export function useMonthlyCountsQuery(year: number) {
  return useQuery({
    queryKey: queryKeys.transactions.monthlyCounts(year),
    queryFn: () => productionApi.getMonthlyCounts(year),
  });
}

export function useQuantityCorrectTransactionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      logId,
      payload,
    }: {
      logId: string;
      payload: Parameters<typeof productionApi.quantityCorrectTransaction>[1];
    }) => productionApi.quantityCorrectTransaction(logId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.transactions.all }),
  });
}
