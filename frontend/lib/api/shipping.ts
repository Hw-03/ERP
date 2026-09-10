import {
  deleteJson,
  fetcher,
  patchJson,
  postJson,
  ResultUnknownError,
  toApiUrl,
} from "../api-core";
import { clearPendingCommand, runPendingCommand } from "../pending-command-storage";
import { makeClientRequestId } from "../uuid";
import type { components } from "./generated/openapi";
import {
  fieldsMatch,
  isOptionalNullableString,
  isRecord,
  isString,
} from "./openapi-runtime";
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
  ShippingRequestPage,
  ShippingRequestPageParams,
  ShippingRequestStatus,
  ShippingRequestRevision,
  ShippingRequestUpdatePayload,
} from "./types/shipping";

type OpenApiShippingRequest = components["schemas"]["ShippingRequestResponse"];
type OpenApiShippingRequestPage = components["schemas"]["ShippingRequestPageResponse"];
type OpenApiShippingHistoryPage = components["schemas"]["ShippingHistoryPageResponse"];
type ShippingSchema = components["schemas"];

const SHIPPING_REQUEST_STATUSES = new Set<string>([
  "PREPARING",
  "PREPARED",
  "PICKED_UP",
  "CANCELLED",
]);
const SHIPPING_FINALIZATION_MODES = new Set<string>([
  "KEEP_BASE",
  "REUSE_CANDIDATE",
  "CREATE_NEW",
]);

function hasRequiredFields(
  value: unknown,
  stringFields: readonly string[],
  numberFields: readonly string[] = [],
  booleanFields: readonly string[] = [],
): value is Record<string, unknown> {
  return (
    isRecord(value)
    && fieldsMatch(value, stringFields, isString)
    && fieldsMatch(
      value,
      numberFields,
      (field) => typeof field === "number" && Number.isFinite(field),
    )
    && fieldsMatch(value, booleanFields, (field) => typeof field === "boolean")
  );
}

function isOptionalArrayOf(
  value: unknown,
  predicate: (item: unknown) => boolean,
): boolean {
  return value === undefined || (Array.isArray(value) && value.every(predicate));
}

const isShippingAllocation = (value: unknown): value is ShippingSchema["ShippingAllocationResponse"] =>
  hasRequiredFields(
    value,
    ["allocation_id", "created_at", "item_id", "item_name", "request_id", "status"],
    ["quantity"],
  );

const isShippingBomLine = (value: unknown): value is ShippingSchema["ShippingBomLineResponse"] =>
  hasRequiredFields(
    value,
    ["child_item_id", "item_name", "line_id", "parent_stage", "unit"],
    ["quantity"],
  );

const isShippingChecklistLine = (
  value: unknown,
): value is ShippingSchema["ShippingChecklistLineResponse"] =>
  hasRequiredFields(value, ["item_id", "item_name", "line_id"], ["quantity"], ["checked"]);

const isShippingCompanionLine = (
  value: unknown,
): value is ShippingSchema["ShippingCompanionLineResponse"] =>
  hasRequiredFields(value, ["item_id", "item_name", "line_id", "unit"], ["quantity"]);

const isShippingEvent = (value: unknown): value is ShippingSchema["ShippingEventResponse"] =>
  hasRequiredFields(value, ["created_at", "event_id", "event_type"]);

const isShippingStockShortage = (
  value: unknown,
): value is ShippingSchema["ShippingStockShortageResponse"] =>
  hasRequiredFields(
    value,
    ["item_id", "item_name", "phase"],
    [
      "allocated_quantity",
      "available_quantity",
      "current_quantity",
      "required_quantity",
      "shortage_quantity",
    ],
  );

const isShippingTransaction = (
  value: unknown,
): value is ShippingSchema["ShippingTransactionLogResponse"] =>
  hasRequiredFields(
    value,
    ["created_at", "item_id", "item_name", "log_id", "transaction_type"],
    ["quantity_change"],
  );

function isShippingRevision(
  value: unknown,
): value is ShippingSchema["ShippingRequestRevisionResponse"] {
  return (
    hasRequiredFields(
      value,
      [
        "created_at",
        "edited_by_employee_id",
        "edited_by_name",
        "request_id",
        "revision_id",
        "summary",
      ],
      [],
      ["affects_preparation"],
    )
    && Array.isArray(value.changes)
    && value.changes.every(
      (change) => isRecord(change) && isString(change.field),
    )
  );
}

function isOpenApiShippingRequest(value: unknown): value is OpenApiShippingRequest {
  return (
    isRecord(value)
    && fieldsMatch(
      value,
      [
        "base_pf_item_id",
        "base_pf_item_name",
        "created_at",
        "finalization_mode",
        "request_id",
        "status",
        "updated_at",
      ],
      isString,
    )
    && SHIPPING_REQUEST_STATUSES.has(value.status as string)
    && SHIPPING_FINALIZATION_MODES.has(value.finalization_mode as string)
    && fieldsMatch(
      value,
      [
        "base_pf_mes_code",
        "cancelled_at",
        "cancelled_by_employee_id",
        "cancelled_by_name",
        "custom_pa_name",
        "custom_pf_name",
        "final_pa_item_id",
        "final_pa_item_name",
        "final_pf_item_id",
        "final_pf_item_name",
        "invoice_number",
        "notes",
        "picked_up_at",
        "prepared_at",
        "prepared_by_employee_id",
        "prepared_by_name",
        "requested_by_name",
        "reuse_pf_item_id",
        "serial_numbers",
      ],
      isOptionalNullableString,
    )
    && isOptionalArrayOf(value.allocations, isShippingAllocation)
    && isOptionalArrayOf(value.bom_lines, isShippingBomLine)
    && isOptionalArrayOf(value.checklist_lines, isShippingChecklistLine)
    && isOptionalArrayOf(value.companion_lines, isShippingCompanionLine)
    && isOptionalArrayOf(value.events, isShippingEvent)
    && isOptionalArrayOf(value.stock_shortages, isShippingStockShortage)
    && isOptionalArrayOf(value.transactions, isShippingTransaction)
    && (
      value.request_quantity === undefined
      || (typeof value.request_quantity === "number" && Number.isFinite(value.request_quantity))
    )
    && (
      value.transaction_count === undefined
      || (typeof value.transaction_count === "number" && Number.isFinite(value.transaction_count))
    )
    && (
      value.latest_preparation_revision === undefined
      || value.latest_preparation_revision === null
      || isShippingRevision(value.latest_preparation_revision)
    )
  );
}

function asShippingBomParentStage(value: string): "PA" | "PF" {
  if (value === "PA" || value === "PF") return value;
  throw new Error(`지원하지 않는 출하 BOM 단계: ${value}`);
}

function asShippingBomLineOrigin(value: string): "DEFAULT" | "CUSTOM" {
  if (value === "DEFAULT" || value === "CUSTOM") return value;
  throw new Error(`지원하지 않는 출하 BOM 원본: ${value}`);
}

function fromOpenApiShippingRevision(
  raw: components["schemas"]["ShippingRequestRevisionResponse"],
): ShippingRequestRevision {
  return {
    ...raw,
    changes: raw.changes.map((change) => ({
      field: change.field,
      before: change.before,
      after: change.after,
    })),
  };
}

/** Generated shipping response의 생략 가능한 표시 필드를 public facade로 정규화한다. */
function fromOpenApiShippingRequest(raw: OpenApiShippingRequest): ShippingRequest {
  return {
    ...raw,
    request_quantity: raw.request_quantity ?? 1,
    base_pf_mes_code: raw.base_pf_mes_code ?? null,
    final_pa_item_id: raw.final_pa_item_id ?? null,
    final_pa_item_name: raw.final_pa_item_name ?? null,
    final_pf_item_id: raw.final_pf_item_id ?? null,
    final_pf_item_name: raw.final_pf_item_name ?? null,
    requested_by_name: raw.requested_by_name ?? null,
    custom_pa_name: raw.custom_pa_name ?? null,
    custom_pf_name: raw.custom_pf_name ?? null,
    notes: raw.notes ?? null,
    serial_numbers: raw.serial_numbers ?? null,
    prepared_at: raw.prepared_at ?? null,
    picked_up_at: raw.picked_up_at ?? null,
    bom_lines: (raw.bom_lines ?? []).map((line) => ({
      ...line,
      parent_stage: asShippingBomParentStage(line.parent_stage),
      included: line.included ?? true,
      mes_code: line.mes_code ?? null,
      process_type_code: line.process_type_code ?? null,
      origin: asShippingBomLineOrigin(line.origin ?? "CUSTOM"),
    })),
    companion_lines: (raw.companion_lines ?? []).map((line) => ({
      ...line,
      mes_code: line.mes_code ?? null,
      process_type_code: line.process_type_code ?? null,
    })),
    checklist_lines: (raw.checklist_lines ?? []).map((line) => ({
      ...line,
      mes_code: line.mes_code ?? null,
      process_type_code: line.process_type_code ?? null,
    })),
    events: (raw.events ?? []).map((event) => ({
      ...event,
      message: event.message ?? null,
      actor_employee_id: event.actor_employee_id ?? null,
      actor_employee_code: event.actor_employee_code ?? null,
      actor_name: event.actor_name ?? null,
    })),
    latest_preparation_revision: raw.latest_preparation_revision
      ? fromOpenApiShippingRevision(raw.latest_preparation_revision)
      : null,
    transaction_count: raw.transaction_count ?? 0,
    transactions: (raw.transactions ?? []).map((transaction) => ({
      ...transaction,
      cancelled: transaction.cancelled ?? false,
      mes_code: transaction.mes_code ?? null,
      item_process_type_code: transaction.item_process_type_code ?? null,
      quantity_before: transaction.quantity_before ?? null,
      quantity_after: transaction.quantity_after ?? null,
      warehouse_qty_before: transaction.warehouse_qty_before ?? null,
      warehouse_qty_after: transaction.warehouse_qty_after ?? null,
      reference_no: transaction.reference_no ?? null,
      produced_by: transaction.produced_by ?? null,
      notes: transaction.notes ?? null,
      shipping_phase: transaction.shipping_phase ?? null,
      cancel_reason: transaction.cancel_reason ?? null,
      cancelled_at: transaction.cancelled_at ?? null,
      inventory_effect: transaction.inventory_effect ?? null,
    })),
    allocations: (raw.allocations ?? []).map((allocation) => ({
      ...allocation,
      mes_code: allocation.mes_code ?? null,
      process_type_code: allocation.process_type_code ?? null,
      department: allocation.department ?? null,
      reference_no: allocation.reference_no ?? null,
      released_at: allocation.released_at ?? null,
      consumed_at: allocation.consumed_at ?? null,
      released_reason: allocation.released_reason ?? null,
      unit: allocation.unit ?? "EA",
    })),
    stock_shortages: (raw.stock_shortages ?? []).map((shortage) => ({
      ...shortage,
      mes_code: shortage.mes_code ?? null,
      process_type_code: shortage.process_type_code ?? null,
      department: shortage.department ?? null,
    })),
  };
}

function fromOpenApiShippingMutation(raw: unknown): ShippingRequest {
  try {
    if (!isOpenApiShippingRequest(raw)) throw new Error("invalid shipping response");
    return fromOpenApiShippingRequest(raw);
  } catch (error) {
    if (error instanceof ResultUnknownError) throw error;
    throw new ResultUnknownError();
  }
}

function fromOpenApiShippingPage(
  raw: OpenApiShippingRequestPage | OpenApiShippingHistoryPage,
): ShippingRequestPage {
  return {
    requests: (raw.requests ?? []).map(fromOpenApiShippingRequest),
    next_cursor: raw.next_cursor ?? null,
    has_more: raw.has_more,
  };
}

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
    (request) => postJson<OpenApiShippingRequest>(
      toApiUrl(`/api/shipping/requests/${requestId}/prepare-complete`),
      request,
    ).then(fromOpenApiShippingMutation),
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
    (request) => postJson<OpenApiShippingRequest>(
      toApiUrl(`/api/shipping/requests/${requestId}/prepare-cancel`),
      request,
    ).then(fromOpenApiShippingMutation),
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
    (request) => postJson<OpenApiShippingRequest>(
      toApiUrl(`/api/shipping/requests/${requestId}/${suffix}`),
      request,
    ).then(fromOpenApiShippingMutation),
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

function requestPageQuery(params?: ShippingRequestPageParams): string {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
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
  const rawPage = await fetcher<OpenApiShippingHistoryPage>(
    toApiUrl(`/api/shipping/history${historyQuery(params)}`),
    opts?.signal,
  );
  const page = fromOpenApiShippingPage(rawPage);
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
    return fetcher<OpenApiShippingRequest[]>(
      toApiUrl(`/api/shipping/requests${suffix}`),
      opts?.signal,
    ).then((rows) => rows.map(fromOpenApiShippingRequest));
  },

  getShippingRequest: (
    requestId: string,
    opts?: { signal?: AbortSignal },
  ): Promise<ShippingRequest> =>
    fetcher<OpenApiShippingRequest>(
      toApiUrl(`/api/shipping/requests/${requestId}`),
      opts?.signal,
    ).then(fromOpenApiShippingRequest),

  getShippingRequestPage: (
    params: ShippingRequestPageParams = {},
    opts?: { signal?: AbortSignal },
  ): Promise<ShippingRequestPage> => fetcher<OpenApiShippingRequestPage>(
      toApiUrl(`/api/shipping/requests/page${requestPageQuery(params)}`),
      opts?.signal,
    ).then(fromOpenApiShippingPage),

  createShippingRequest: (payload: ShippingRequestCreatePayload) =>
    postJson<OpenApiShippingRequest>(toApiUrl("/api/shipping/requests"), payload)
      .then(fromOpenApiShippingMutation),

  updateShippingRequest: (requestId: string, payload: ShippingRequestUpdatePayload) =>
    patchJson<OpenApiShippingRequest>(
      toApiUrl(`/api/shipping/requests/${requestId}`), payload,
    ).then(fromOpenApiShippingMutation),

  updateShippingInvoice: (requestId: string, invoiceNumber: string | null) =>
    patchJson<OpenApiShippingRequest>(toApiUrl(`/api/shipping/requests/${requestId}/invoice`), {
      invoice_number: invoiceNumber,
    }).then(fromOpenApiShippingMutation),

  getShippingRevisions: (requestId: string, opts?: { signal?: AbortSignal }) =>
    fetcher<ShippingRequestRevision[]>(
      toApiUrl(`/api/shipping/requests/${requestId}/revisions`),
      opts?.signal,
    ),

  deleteShippingRequest: (requestId: string) =>
    deleteJson(toApiUrl(`/api/shipping/requests/${requestId}`)),

  updateShippingChecklist: (requestId: string, payload: ShippingChecklistUpdatePayload) =>
    patchJson<OpenApiShippingRequest>(
      toApiUrl(`/api/shipping/requests/${requestId}/checklist`), payload,
    ).then(fromOpenApiShippingMutation),

  clearShippingChecklist: (requestId: string) =>
    postJson<OpenApiShippingRequest>(
      toApiUrl(`/api/shipping/requests/${requestId}/checklist/clear`), {},
    ).then(fromOpenApiShippingMutation),

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

  matchShippingBom: (
    payload: { base_pf_item_id: string; bom_lines: ShippingBomLineInput[] },
    opts?: { signal?: AbortSignal },
  ) => postJson<ShippingBomMatchResponse>(
    toApiUrl("/api/shipping/bom-match"),
    payload,
    opts?.signal,
  ),
};
