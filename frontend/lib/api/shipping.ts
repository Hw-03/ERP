import { deleteJson, fetcher, patchJson, postJson, toApiUrl } from "../api-core";
import type {
  ShippingBomLineInput,
  ShippingBomMatchResponse,
  ShippingChecklistUpdatePayload,
  ShippingHistoryMonth,
  ShippingHistoryPage,
  ShippingHistoryParams,
  ShippingHistoryStatus,
  ShippingPrepareCancelPayload,
  ShippingPrepareCompletePayload,
  ShippingRequest,
  ShippingRequestCreatePayload,
  ShippingRequestStatus,
  ShippingRequestRevision,
  ShippingRequestUpdatePayload,
} from "./types/shipping";

function historyQuery(params?: ShippingHistoryParams): string {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.year !== undefined) qs.set("year", String(params.year));
  if (params?.month !== undefined) qs.set("month", String(params.month));
  if (params?.q) qs.set("q", params.q);
  if (params?.cursor) qs.set("cursor", params.cursor);
  if (params?.limit !== undefined) qs.set("limit", String(params.limit));
  return qs.toString() ? `?${qs}` : "";
}

function getShippingHistory(): Promise<ShippingRequest[]>;
function getShippingHistory(
  params: ShippingHistoryParams,
  opts?: { signal?: AbortSignal },
): Promise<ShippingHistoryPage>;
async function getShippingHistory(
  params?: ShippingHistoryParams,
  opts?: { signal?: AbortSignal },
): Promise<ShippingHistoryPage | ShippingRequest[]> {
  const page = await fetcher<ShippingHistoryPage>(
    toApiUrl(`/api/shipping/history${historyQuery(params)}`),
    opts?.signal,
  );
  return params ? page : page.requests;
}

export const shippingApi = {
  getShippingRequests: (
    params?: { status?: ShippingRequestStatus },
    opts?: { signal?: AbortSignal },
  ) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    const suffix = qs.toString() ? `?${qs}` : "";
    return fetcher<ShippingRequest[]>(toApiUrl(`/api/shipping/requests${suffix}`), opts?.signal);
  },

  getShippingRequest: (
    requestId: string,
    opts?: { signal?: AbortSignal },
  ): Promise<ShippingRequest> =>
    fetcher<ShippingRequest>(toApiUrl(`/api/shipping/requests/${requestId}`), opts?.signal),

  createShippingRequest: (payload: ShippingRequestCreatePayload) =>
    postJson<ShippingRequest>(toApiUrl("/api/shipping/requests"), payload),

  updateShippingRequest: (requestId: string, payload: ShippingRequestUpdatePayload) =>
    patchJson<ShippingRequest>(toApiUrl(`/api/shipping/requests/${requestId}`), payload),

  updateShippingInvoice: (requestId: string, invoiceNumber: string | null) =>
    patchJson<ShippingRequest>(toApiUrl(`/api/shipping/requests/${requestId}/invoice`), {
      invoice_number: invoiceNumber,
    }),

  getShippingRevisions: (requestId: string, opts?: { signal?: AbortSignal }) =>
    fetcher<ShippingRequestRevision[]>(
      toApiUrl(`/api/shipping/requests/${requestId}/revisions`),
      opts?.signal,
    ),

  deleteShippingRequest: (requestId: string) =>
    deleteJson(toApiUrl(`/api/shipping/requests/${requestId}`)),

  sendShippingToPrep: (requestId: string) =>
    postJson<ShippingRequest>(toApiUrl(`/api/shipping/requests/${requestId}/send-to-prep`), {}),

  updateShippingChecklist: (requestId: string, payload: ShippingChecklistUpdatePayload) =>
    patchJson<ShippingRequest>(toApiUrl(`/api/shipping/requests/${requestId}/checklist`), payload),

  clearShippingChecklist: (requestId: string) =>
    postJson<ShippingRequest>(toApiUrl(`/api/shipping/requests/${requestId}/checklist/clear`), {}),

  prepareShippingComplete: (requestId: string, payload: ShippingPrepareCompletePayload = {}) =>
    postJson<ShippingRequest>(toApiUrl(`/api/shipping/requests/${requestId}/prepare-complete`), payload),

  cancelShippingPrepare: (requestId: string, payload: ShippingPrepareCancelPayload) =>
    postJson<ShippingRequest>(toApiUrl(`/api/shipping/requests/${requestId}/prepare-cancel`), payload),

  completeShippingPickup: (requestId: string) =>
    postJson<ShippingRequest>(toApiUrl(`/api/shipping/requests/${requestId}/pickup-complete`), {}),

  getShippingHistory,

  getShippingHistoryMonths: (
    params?: { status?: ShippingHistoryStatus; year?: number },
    opts?: { signal?: AbortSignal },
  ) =>
    fetcher<ShippingHistoryMonth[]>(
      toApiUrl(`/api/shipping/history/months${historyQuery(params)}`),
      opts?.signal,
    ),

  matchShippingBom: (payload: { base_pf_item_id: string; bom_lines: ShippingBomLineInput[] }) =>
    postJson<ShippingBomMatchResponse>(toApiUrl("/api/shipping/bom-match"), payload),
};
