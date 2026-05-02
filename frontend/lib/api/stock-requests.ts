/**
 * Stock requests 도메인 API — `@/lib/api/stock-requests`.
 *
 * Round-6 (R6-D8) 분리. 창고 결재 흐름 + draft 장바구니. 11 메소드.
 */

import { fetcher, parseError, toApiUrl } from "../api-core";
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
  createStockRequest: async (payload: StockRequestCreatePayload): Promise<StockRequest> => {
    const res = await fetch(toApiUrl("/api/stock-requests"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<StockRequest>;
  },

  listMyStockRequests: (employeeId: string) =>
    fetcher<StockRequest[]>(
      toApiUrl(
        `/api/stock-requests?requester_employee_id=${encodeURIComponent(employeeId)}`
      )
    ),

  listWarehouseQueue: () =>
    fetcher<StockRequest[]>(toApiUrl("/api/stock-requests/warehouse-queue")),

  approveStockRequest: async (
    requestId: string,
    payload: StockRequestActionPayload
  ): Promise<StockRequest> => {
    const res = await fetch(toApiUrl(`/api/stock-requests/${requestId}/approve`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<StockRequest>;
  },

  rejectStockRequest: async (
    requestId: string,
    payload: StockRequestActionPayload
  ): Promise<StockRequest> => {
    const res = await fetch(toApiUrl(`/api/stock-requests/${requestId}/reject`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<StockRequest>;
  },

  cancelStockRequest: async (
    requestId: string,
    payload: StockRequestActionPayload
  ): Promise<StockRequest> => {
    const res = await fetch(toApiUrl(`/api/stock-requests/${requestId}/cancel`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<StockRequest>;
  },

  getItemReservations: (itemId: string) =>
    fetcher<StockRequestReservationLine[]>(
      toApiUrl(`/api/stock-requests/reservations?item_id=${encodeURIComponent(itemId)}`)
    ),

  // Stock request drafts (직원별 저장형 입출고 장바구니) -------------------
  upsertStockRequestDraft: async (
    payload: StockRequestDraftUpsertPayload
  ): Promise<StockRequest> => {
    const res = await fetch(toApiUrl("/api/stock-requests/draft"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<StockRequest>;
  },

  getStockRequestDraft: async (
    requesterEmployeeId: string,
    requestType: StockRequestType
  ): Promise<StockRequest | null> => {
    const res = await fetch(
      toApiUrl(
        `/api/stock-requests/draft?requester_employee_id=${encodeURIComponent(
          requesterEmployeeId
        )}&request_type=${encodeURIComponent(requestType)}`
      )
    );
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<StockRequest | null>;
  },

  listStockRequestDrafts: (requesterEmployeeId: string) =>
    fetcher<StockRequest[]>(
      toApiUrl(
        `/api/stock-requests/drafts?requester_employee_id=${encodeURIComponent(
          requesterEmployeeId
        )}`
      )
    ),

  deleteStockRequestDraft: async (
    requestId: string,
    requesterEmployeeId: string
  ): Promise<void> => {
    const res = await fetch(
      toApiUrl(
        `/api/stock-requests/draft/${requestId}?requester_employee_id=${encodeURIComponent(
          requesterEmployeeId
        )}`
      ),
      { method: "DELETE" }
    );
    if (!res.ok) throw new Error(await parseError(res));
  },

  submitStockRequestDraft: async (
    requestId: string,
    requesterEmployeeId: string
  ): Promise<StockRequest> => {
    const res = await fetch(toApiUrl(`/api/stock-requests/${requestId}/submit`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requester_employee_id: requesterEmployeeId }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<StockRequest>;
  },
};
