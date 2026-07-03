import { deleteJson, fetcher, patchJson, postJson, toApiUrl } from "../api-core";
import type {
  ShippingBomLineInput,
  ShippingBomMatchResponse,
  ShippingChecklistUpdatePayload,
  ShippingComponentChangeExecutePayload,
  ShippingComponentChangePreview,
  ShippingComponentChangeResult,
  ShippingPrepareCancelPayload,
  ShippingPrepareCompletePayload,
  ShippingRequest,
  ShippingRequestCreatePayload,
  ShippingRequestStatus,
  ShippingRequestUpdatePayload,
} from "./types/shipping";

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

  createShippingRequest: (payload: ShippingRequestCreatePayload) =>
    postJson<ShippingRequest>(toApiUrl("/api/shipping/requests"), payload),

  updateShippingRequest: (requestId: string, payload: ShippingRequestUpdatePayload) =>
    patchJson<ShippingRequest>(toApiUrl(`/api/shipping/requests/${requestId}`), payload),

  deleteShippingRequest: (requestId: string) =>
    deleteJson(toApiUrl(`/api/shipping/requests/${requestId}`)),

  sendShippingToPrep: (requestId: string) =>
    postJson<ShippingRequest>(toApiUrl(`/api/shipping/requests/${requestId}/send-to-prep`), {}),

  updateShippingChecklist: (requestId: string, payload: ShippingChecklistUpdatePayload) =>
    patchJson<ShippingRequest>(toApiUrl(`/api/shipping/requests/${requestId}/checklist`), payload),

  clearShippingChecklist: (requestId: string) =>
    postJson<ShippingRequest>(toApiUrl(`/api/shipping/requests/${requestId}/checklist/clear`), {}),

  getShippingComponentChangePreview: (
    requestId: string,
    params: { source_pa_item_id: string; quantity: number },
    opts?: { signal?: AbortSignal },
  ) => {
    const qs = new URLSearchParams();
    qs.set("source_pa_item_id", params.source_pa_item_id);
    qs.set("quantity", String(params.quantity));
    return fetcher<ShippingComponentChangePreview>(
      toApiUrl(`/api/shipping/requests/${requestId}/component-change-preview?${qs}`),
      opts?.signal,
    );
  },

  executeShippingComponentChange: (requestId: string, payload: ShippingComponentChangeExecutePayload) =>
    postJson<ShippingRequest>(toApiUrl(`/api/shipping/requests/${requestId}/component-change`), payload),

  getIndependentShippingComponentChangePreview: (
    params: { source_pa_item_id: string; target_pa_item_id: string; quantity: number },
    opts?: { signal?: AbortSignal },
  ) => {
    const qs = new URLSearchParams();
    qs.set("source_pa_item_id", params.source_pa_item_id);
    qs.set("target_pa_item_id", params.target_pa_item_id);
    qs.set("quantity", String(params.quantity));
    return fetcher<ShippingComponentChangePreview>(
      toApiUrl(`/api/shipping/component-change-preview?${qs}`),
      opts?.signal,
    );
  },

  executeIndependentShippingComponentChange: (payload: ShippingComponentChangeExecutePayload) =>
    postJson<ShippingComponentChangeResult>(toApiUrl("/api/shipping/component-change"), payload),
  prepareShippingComplete: (requestId: string, payload: ShippingPrepareCompletePayload = {}) =>
    postJson<ShippingRequest>(toApiUrl(`/api/shipping/requests/${requestId}/prepare-complete`), payload),

  cancelShippingPrepare: (requestId: string, payload: ShippingPrepareCancelPayload) =>
    postJson<ShippingRequest>(toApiUrl(`/api/shipping/requests/${requestId}/prepare-cancel`), payload),

  completeShippingPickup: (requestId: string) =>
    postJson<ShippingRequest>(toApiUrl(`/api/shipping/requests/${requestId}/pickup-complete`), {}),

  getShippingHistory: (opts?: { signal?: AbortSignal }) =>
    fetcher<ShippingRequest[]>(toApiUrl("/api/shipping/history"), opts?.signal),

  matchShippingBom: (payload: { base_pf_item_id: string; bom_lines: ShippingBomLineInput[] }) =>
    postJson<ShippingBomMatchResponse>(toApiUrl("/api/shipping/bom-match"), payload),
};
