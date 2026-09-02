import { deleteJson, fetcher, patchJson, postJson, toApiUrl } from "../api-core";
import { clearPendingCommand, runPendingCommand } from "../pending-command-storage";
import { makeClientRequestId } from "../uuid";
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
  ShippingPickupCommandPayload,
  ShippingRequest,
  ShippingRequestCreatePayload,
  ShippingRequestStatus,
  ShippingRequestRevision,
  ShippingRequestUpdatePayload,
} from "./types/shipping";

const actorScope = (actorEmployeeId?: string) => actorEmployeeId?.trim() || "verified-session";
const prepareCompleteScope = (requestId: string, actorEmployeeId?: string) =>
  `shipping:${actorScope(actorEmployeeId)}:prepare-complete:${requestId}`;
const prepareCancelScope = (requestId: string, actorEmployeeId?: string) =>
  `shipping:${actorScope(actorEmployeeId)}:prepare-cancel:${requestId}`;
const pickupCompleteScope = (requestId: string, actorEmployeeId?: string) =>
  `shipping:${actorScope(actorEmployeeId)}:pickup-complete:${requestId}`;
const pickupCancelScope = (requestId: string, actorEmployeeId?: string) =>
  `shipping:${actorScope(actorEmployeeId)}:pickup-cancel:${requestId}`;

async function prepareShippingComplete(
  requestId: string,
  payload: ShippingPrepareCompletePayload,
  actorEmployeeId?: string,
): Promise<ShippingRequest> {
  const command = {
    ...payload,
    client_request_id: payload.client_request_id ?? makeClientRequestId(),
    expected_status: payload.expected_status ?? "PREPARING",
  } satisfies ShippingPrepareCompletePayload;
  const result = await runPendingCommand(
    prepareCompleteScope(requestId, actorEmployeeId),
    command,
    (request) => postJson<ShippingRequest>(
      toApiUrl(`/api/shipping/requests/${requestId}/prepare-complete`),
      request,
    ),
  );
  clearPendingCommand(prepareCancelScope(requestId, actorEmployeeId));
  return result;
}

async function cancelShippingPrepare(
  requestId: string,
  payload: ShippingPrepareCancelPayload,
  actorEmployeeId?: string,
): Promise<ShippingRequest> {
  const command = {
    ...payload,
    client_request_id: payload.client_request_id ?? makeClientRequestId(),
    expected_status: payload.expected_status ?? "PREPARED",
  } satisfies ShippingPrepareCancelPayload;
  const result = await runPendingCommand(
    prepareCancelScope(requestId, actorEmployeeId),
    command,
    (request) => postJson<ShippingRequest>(
      toApiUrl(`/api/shipping/requests/${requestId}/prepare-cancel`),
      request,
    ),
  );
  clearPendingCommand(prepareCompleteScope(requestId, actorEmployeeId));
  return result;
}

async function runPickupCommand(
  requestId: string,
  kind: "complete" | "cancel",
  payload: ShippingPickupCommandPayload,
  actorEmployeeId?: string,
): Promise<ShippingRequest> {
  const expectedStatus: ShippingRequestStatus = kind === "complete" ? "PREPARED" : "PICKED_UP";
  const command = {
    ...payload,
    client_request_id: payload.client_request_id ?? makeClientRequestId(),
    expected_status: payload.expected_status ?? expectedStatus,
  } satisfies ShippingPickupCommandPayload;
  const suffix = kind === "complete" ? "pickup-complete" : "pickup-cancel";
  const scope = kind === "complete"
    ? pickupCompleteScope(requestId, actorEmployeeId)
    : pickupCancelScope(requestId, actorEmployeeId);
  const result = await runPendingCommand(
    scope,
    command,
    (request) => postJson<ShippingRequest>(
      toApiUrl(`/api/shipping/requests/${requestId}/${suffix}`),
      request,
    ),
  );
  clearPendingCommand(
    kind === "complete"
      ? pickupCancelScope(requestId, actorEmployeeId)
      : pickupCompleteScope(requestId, actorEmployeeId),
  );
  return result;
}

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

  updateShippingChecklist: (requestId: string, payload: ShippingChecklistUpdatePayload) =>
    patchJson<ShippingRequest>(toApiUrl(`/api/shipping/requests/${requestId}/checklist`), payload),

  clearShippingChecklist: (requestId: string) =>
    postJson<ShippingRequest>(toApiUrl(`/api/shipping/requests/${requestId}/checklist/clear`), {}),

  prepareShippingComplete,

  cancelShippingPrepare,

  completeShippingPickup: (
    requestId: string,
    payload: ShippingPickupCommandPayload = {},
    actorEmployeeId?: string,
  ) => runPickupCommand(requestId, "complete", payload, actorEmployeeId),

  cancelShippingPickup: (
    requestId: string,
    payload: ShippingPickupCommandPayload = {},
    actorEmployeeId?: string,
  ) => runPickupCommand(requestId, "cancel", payload, actorEmployeeId),

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
