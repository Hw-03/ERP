/**
 * Stock requests 도메인 API — `@/lib/api/stock-requests`.
 *
 * Round-6 (R6-D8) 분리. 창고 결재 흐름 + draft 장바구니. 11 메소드.
 */

import { deleteJson, fetcher, postJson, putJson, toApiUrl } from "../api-core";
import type {
  StockRequest,
  StockRequestActionPayload,
  StockRequestCreatePayload,
  StockRequestDraftUpsertPayload,
  StockRequestReservationLine,
  StockRequestType,
} from "./types";

export const stockRequestsApi = {
  // Stock requests (창고 결재 흐름) -----------------------------------------
  createStockRequest: (payload: StockRequestCreatePayload) =>
    postJson<StockRequest>(toApiUrl("/api/stock-requests"), payload),

  listMyStockRequests: (employeeId: string) =>
    fetcher<StockRequest[]>(
      toApiUrl(
        `/api/stock-requests?requester_employee_id=${encodeURIComponent(employeeId)}`,
      ),
    ),

  listWarehouseQueue: () =>
    fetcher<StockRequest[]>(toApiUrl("/api/stock-requests/warehouse-queue")),

  approveStockRequest: (requestId: string, payload: StockRequestActionPayload) =>
    postJson<StockRequest>(toApiUrl(`/api/stock-requests/${requestId}/approve`), payload),

  rejectStockRequest: (requestId: string, payload: StockRequestActionPayload) =>
    postJson<StockRequest>(toApiUrl(`/api/stock-requests/${requestId}/reject`), payload),

  cancelStockRequest: (requestId: string, payload: StockRequestActionPayload) =>
    postJson<StockRequest>(toApiUrl(`/api/stock-requests/${requestId}/cancel`), payload),

  getItemReservations: (itemId: string) =>
    fetcher<StockRequestReservationLine[]>(
      toApiUrl(`/api/stock-requests/reservations?item_id=${encodeURIComponent(itemId)}`),
    ),

  // Stock request drafts (직원별 저장형 입출고 장바구니) -------------------
  upsertStockRequestDraft: (payload: StockRequestDraftUpsertPayload) =>
    putJson<StockRequest>(toApiUrl("/api/stock-requests/draft"), payload),

  getStockRequestDraft: (
    requesterEmployeeId: string,
    requestType: StockRequestType,
  ): Promise<StockRequest | null> =>
    fetcher<StockRequest | null>(
      toApiUrl(
        `/api/stock-requests/draft?requester_employee_id=${encodeURIComponent(
          requesterEmployeeId,
        )}&request_type=${encodeURIComponent(requestType)}`,
      ),
    ),

  listStockRequestDrafts: (requesterEmployeeId: string) =>
    fetcher<StockRequest[]>(
      toApiUrl(
        `/api/stock-requests/drafts?requester_employee_id=${encodeURIComponent(
          requesterEmployeeId,
        )}`,
      ),
    ),

  deleteStockRequestDraft: (requestId: string, requesterEmployeeId: string) =>
    deleteJson<void>(
      toApiUrl(
        `/api/stock-requests/draft/${requestId}?requester_employee_id=${encodeURIComponent(
          requesterEmployeeId,
        )}`,
      ),
    ),

  submitStockRequestDraft: (requestId: string, requesterEmployeeId: string) =>
    postJson<StockRequest>(toApiUrl(`/api/stock-requests/${requestId}/submit`), {
      requester_employee_id: requesterEmployeeId,
    }),
};
