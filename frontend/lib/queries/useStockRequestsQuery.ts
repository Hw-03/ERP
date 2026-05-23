"use client";

/**
 * Stock-requests 도메인 React Query hook — W7-8.
 *
 * stockRequestsApi 기반. 창고 결재·부서 결재·draft 흐름을 묶음.
 * 인터페이스 ≤ 6:
 *   useWarehouseQueueQuery / useDepartmentQueueQuery /
 *   useApproveStockRequestMutation / useRejectStockRequestMutation /
 *   useCancelStockRequestMutation / useDraftOperations
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import type { StockRequestActionPayload, StockRequestCreatePayload } from "@/lib/api/types";
import { queryKeys } from "./keys";

/** 창고 승인 대기열 */
export function useWarehouseQueueQuery() {
  return useQuery({
    queryKey: queryKeys.stockRequests.warehouseQueue(),
    queryFn: () => stockRequestsApi.listWarehouseQueue(),
  });
}

/** 부서 승인 대기열 */
export function useDepartmentQueueQuery(actorEmployeeId: string) {
  return useQuery({
    queryKey: queryKeys.stockRequests.departmentQueue(actorEmployeeId),
    queryFn: () => stockRequestsApi.listDepartmentQueue(actorEmployeeId),
    enabled: !!actorEmployeeId,
  });
}

/** 내 요청 목록 */
export function useMyStockRequestsQuery(employeeId: string) {
  return useQuery({
    queryKey: queryKeys.stockRequests.myList(employeeId),
    queryFn: () => stockRequestsApi.listMyStockRequests(employeeId),
    enabled: !!employeeId,
  });
}

/** 창고 승인 */
export function useApproveStockRequestMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      requestId,
      payload,
    }: {
      requestId: string;
      payload: StockRequestActionPayload;
    }) => stockRequestsApi.approveStockRequest(requestId, payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.stockRequests.all }),
  });
}

/** 창고 반려 */
export function useRejectStockRequestMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      requestId,
      payload,
    }: {
      requestId: string;
      payload: StockRequestActionPayload;
    }) => stockRequestsApi.rejectStockRequest(requestId, payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.stockRequests.all }),
  });
}

/** 요청 취소 */
export function useCancelStockRequestMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      requestId,
      payload,
    }: {
      requestId: string;
      payload: StockRequestActionPayload;
    }) => stockRequestsApi.cancelStockRequest(requestId, payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.stockRequests.all }),
  });
}

/** 새 요청 생성 */
export function useCreateStockRequestMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: StockRequestCreatePayload) =>
      stockRequestsApi.createStockRequest(payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.stockRequests.all }),
  });
}
