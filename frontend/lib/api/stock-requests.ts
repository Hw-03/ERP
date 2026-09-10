/**
 * Stock requests 도메인 API — `@/lib/api/stock-requests`.
 *
 * Round-6 (R6-D8) 분리. 창고 결재 흐름 + draft 장바구니. 11 메소드.
 */

import {
  deleteJson,
  fetcher,
  postJson,
  putJson,
  ResultUnknownError,
  toApiUrl,
} from "../api-core";
import { makeClientRequestId } from "../uuid";
import { runPendingCommand } from "../pending-command-storage";
import type { components } from "./generated/openapi";
import {
  fieldsMatch,
  isOptionalNullableString,
  isRecord,
  isString,
} from "./openapi-runtime";
import type {
  Department,
  StockRequest,
  StockRequestActionPayload,
  StockRequestCommandType,
  StockRequestCreatePayload,
  StockRequestDraftUpsertPayload,
  StockRequestLine,
  StockRequestReservationLine,
} from "./types";
import { isStockRequestCommandType } from "./types/stock-requests";

type OpenApiStockRequestCreate = components["schemas"]["StockRequestCreate"];
type OpenApiStockRequestDraftUpsert = components["schemas"]["StockRequestDraftUpsert"];
type OpenApiStockRequestLine = components["schemas"]["StockRequestLineResponse"];
type OpenApiStockRequestResponse = components["schemas"]["StockRequestResponse"];
type RawStockRequestResponse = Omit<OpenApiStockRequestResponse, "request_type"> & {
  request_type: OpenApiStockRequestResponse["request_type"] | (string & {});
  reason_category?: string | null;
  reason_memo?: string | null;
};

const STOCK_REQUEST_STATUSES = new Set<string>([
  "draft",
  "submitted",
  "reserved",
  "rejected",
  "cancelled",
  "completed",
  "failed_approval",
]);
const REQUEST_BUCKETS = new Set<string>(["warehouse", "production", "defective", "none"]);

function isOpenApiStockRequestLine(value: unknown): value is OpenApiStockRequestLine {
  return (
    isRecord(value)
    && fieldsMatch(
      value,
      ["created_at", "item_id", "item_name_snapshot", "line_id", "request_id"],
      isString,
    )
    && typeof value.quantity === "number"
    && Number.isFinite(value.quantity)
    && typeof value.status === "string"
    && STOCK_REQUEST_STATUSES.has(value.status)
    && typeof value.from_bucket === "string"
    && REQUEST_BUCKETS.has(value.from_bucket)
    && typeof value.to_bucket === "string"
    && REQUEST_BUCKETS.has(value.to_bucket)
    && fieldsMatch(
      value,
      [
        "from_department",
        "mes_code_snapshot",
        "operation_line_id",
        "record_id",
        "to_department",
      ],
      isOptionalNullableString,
    )
  );
}

function isRawStockRequestResponse(value: unknown): value is RawStockRequestResponse {
  return (
    isRecord(value)
    && fieldsMatch(
      value,
      [
        "created_at",
        "request_id",
        "request_type",
        "requester_department",
        "requester_employee_id",
        "requester_name",
        "status",
        "updated_at",
      ],
      isString,
    )
    && STOCK_REQUEST_STATUSES.has(value.status as string)
    && typeof value.requires_warehouse_approval === "boolean"
    && (
      value.requires_department_approval === undefined
      || typeof value.requires_department_approval === "boolean"
    )
    && fieldsMatch(
      value,
      [
        "approval_department",
        "approved_at",
        "approved_by_employee_id",
        "approved_by_name",
        "cancelled_at",
        "completed_at",
        "department_approved_at",
        "department_approved_by_employee_id",
        "department_approved_by_name",
        "notes",
        "operation_batch_id",
        "reason_category",
        "reason_memo",
        "reference_no",
        "rejected_at",
        "rejected_by_employee_id",
        "rejected_by_name",
        "rejected_reason",
        "request_code",
        "reserved_at",
        "submitted_at",
      ],
      isOptionalNullableString,
    )
    && (
      value.lines === undefined
      || (Array.isArray(value.lines) && value.lines.every(isOpenApiStockRequestLine))
    )
  );
}

function asDepartment(value: string): Department;
function asDepartment(value: string | null | undefined): Department | null;
function asDepartment(value: string | null | undefined): Department | null {
  return (value ?? null) as Department | null;
}

function fromOpenApiStockRequestLine(raw: OpenApiStockRequestLine): StockRequestLine {
  return {
    record_id: raw.record_id ?? null,
    line_id: raw.line_id,
    request_id: raw.request_id,
    item_id: raw.item_id,
    item_name_snapshot: raw.item_name_snapshot,
    mes_code_snapshot: raw.mes_code_snapshot ?? null,
    quantity: raw.quantity,
    from_bucket: raw.from_bucket,
    from_department: asDepartment(raw.from_department),
    to_bucket: raw.to_bucket,
    to_department: asDepartment(raw.to_department),
    status: raw.status,
    operation_line_id: raw.operation_line_id ?? null,
    created_at: raw.created_at,
  };
}

/** Generated raw response를 기존 public 업무 타입으로 정규화한다. */
function fromOpenApiStockRequest(raw: RawStockRequestResponse): StockRequest {
  return {
    request_id: raw.request_id,
    request_code: raw.request_code ?? null,
    requester_employee_id: raw.requester_employee_id,
    requester_name: raw.requester_name,
    requester_department: asDepartment(raw.requester_department),
    approval_department: asDepartment(raw.approval_department),
    request_type: raw.request_type,
    status: raw.status,
    requires_warehouse_approval: raw.requires_warehouse_approval,
    reserved_at: raw.reserved_at ?? null,
    submitted_at: raw.submitted_at ?? null,
    approved_by_employee_id: raw.approved_by_employee_id ?? null,
    approved_by_name: raw.approved_by_name ?? null,
    approved_at: raw.approved_at ?? null,
    rejected_by_employee_id: raw.rejected_by_employee_id ?? null,
    rejected_by_name: raw.rejected_by_name ?? null,
    rejected_at: raw.rejected_at ?? null,
    rejected_reason: raw.rejected_reason ?? null,
    requires_department_approval: raw.requires_department_approval ?? false,
    department_approved_by_employee_id: raw.department_approved_by_employee_id ?? null,
    department_approved_by_name: raw.department_approved_by_name ?? null,
    department_approved_at: raw.department_approved_at ?? null,
    cancelled_at: raw.cancelled_at ?? null,
    completed_at: raw.completed_at ?? null,
    reference_no: raw.reference_no ?? null,
    notes: raw.notes ?? null,
    operation_batch_id: raw.operation_batch_id ?? null,
    reason_category: raw.reason_category ?? null,
    reason_memo: raw.reason_memo ?? null,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    lines: (raw.lines ?? []).map(fromOpenApiStockRequestLine),
  };
}

function fromOpenApiStockRequestList(raw: RawStockRequestResponse[]): StockRequest[] {
  return raw.map(fromOpenApiStockRequest);
}

function fromOpenApiStockRequestMutation(raw: unknown): StockRequest {
  try {
    if (!isRawStockRequestResponse(raw)) throw new Error("invalid stock request response");
    return fromOpenApiStockRequest(raw);
  } catch (error) {
    if (error instanceof ResultUnknownError) throw error;
    throw new ResultUnknownError();
  }
}

function assertStockRequestCommandType(value: string): asserts value is StockRequestCommandType {
  if (!isStockRequestCommandType(value)) {
    throw new Error(`지원하지 않는 재고 요청 유형: ${value}`);
  }
}

function toOpenApiStockRequestCreate(
  payload: StockRequestCreatePayload,
): OpenApiStockRequestCreate {
  assertStockRequestCommandType(payload.request_type);
  return payload;
}

function toOpenApiStockRequestDraftUpsert(
  payload: StockRequestDraftUpsertPayload,
): OpenApiStockRequestDraftUpsert {
  assertStockRequestCommandType(payload.request_type);
  return payload;
}

function pendingCreateScope(payload: StockRequestCreatePayload): string {
  const commandScope = payload.client_request_id ?? JSON.stringify(
    payload,
    (key, value) => /^(quantity|notes|reference_no|reason_)/.test(key) ? undefined : value,
  );
  return `${payload.requester_employee_id}:${commandScope}`;
}

async function createStockRequest(
  payload: StockRequestCreatePayload,
): Promise<StockRequest> {
  const scope = pendingCreateScope(payload);
  const wirePayload = toOpenApiStockRequestCreate(payload);
  return runPendingCommand(
    `s:${scope}`,
    {
      ...wirePayload,
      client_request_id: payload.client_request_id ?? makeClientRequestId(),
    } satisfies OpenApiStockRequestCreate,
    (request) => postJson<RawStockRequestResponse>(
      toApiUrl("/api/stock-requests"), request,
    ).then(fromOpenApiStockRequestMutation),
  );
}

export const stockRequestsApi = {
  // Stock requests (창고 결재 흐름) -----------------------------------------
  createStockRequest,

  listMyStockRequests: (employeeId: string, targetRequestId?: string | null) =>
    fetcher<RawStockRequestResponse[]>(
      toApiUrl(
        `/api/stock-requests?requester_employee_id=${encodeURIComponent(employeeId)}${
          targetRequestId
            ? `&target_request_id=${encodeURIComponent(targetRequestId)}`
            : ""
        }`,
      ),
    ).then(fromOpenApiStockRequestList),

  listWarehouseQueue: (targetRequestId?: string | null) =>
    fetcher<RawStockRequestResponse[]>(
      toApiUrl(
        `/api/stock-requests/warehouse-queue${
          targetRequestId
            ? `?target_request_id=${encodeURIComponent(targetRequestId)}`
            : ""
        }`,
      ),
    ).then(fromOpenApiStockRequestList),

  listDepartmentQueue: (actorEmployeeId: string, targetRequestId?: string | null) =>
    fetcher<RawStockRequestResponse[]>(
      toApiUrl(
        `/api/stock-requests/department-queue?actor_employee_id=${encodeURIComponent(
          actorEmployeeId,
        )}${
          targetRequestId
            ? `&target_request_id=${encodeURIComponent(targetRequestId)}`
            : ""
        }`,
      ),
    ).then(fromOpenApiStockRequestList),

  countWarehouseQueue: () =>
    fetcher<{ count: number }>(toApiUrl("/api/stock-requests/warehouse-queue/count")),

  countDepartmentQueue: (actorEmployeeId: string) =>
    fetcher<{ count: number }>(
      toApiUrl(
        `/api/stock-requests/department-queue/count?actor_employee_id=${encodeURIComponent(
          actorEmployeeId,
        )}`,
      ),
    ),

  approveStockRequest: (requestId: string, payload: StockRequestActionPayload) =>
    postJson<RawStockRequestResponse>(
      toApiUrl(`/api/stock-requests/${requestId}/approve`), payload,
    ).then(fromOpenApiStockRequestMutation),

  rejectStockRequest: (requestId: string, payload: StockRequestActionPayload) =>
    postJson<RawStockRequestResponse>(
      toApiUrl(`/api/stock-requests/${requestId}/reject`), payload,
    ).then(fromOpenApiStockRequestMutation),

  approveStockRequestDepartment: (
    requestId: string,
    payload: StockRequestActionPayload,
  ) =>
    postJson<RawStockRequestResponse>(
      toApiUrl(`/api/stock-requests/${requestId}/department-approve`),
      payload,
    ).then(fromOpenApiStockRequestMutation),

  rejectStockRequestDepartment: (
    requestId: string,
    payload: StockRequestActionPayload,
  ) =>
    postJson<RawStockRequestResponse>(
      toApiUrl(`/api/stock-requests/${requestId}/department-reject`),
      payload,
    ).then(fromOpenApiStockRequestMutation),

  cancelStockRequest: (requestId: string, payload: StockRequestActionPayload) =>
    postJson<RawStockRequestResponse>(
      toApiUrl(`/api/stock-requests/${requestId}/cancel`), payload,
    ).then(fromOpenApiStockRequestMutation),

  revertToDraft: (requestId: string, payload: StockRequestActionPayload) =>
    postJson<void>(toApiUrl(`/api/stock-requests/${requestId}/revert-to-draft`), payload),

  getItemReservations: (itemId: string) =>
    fetcher<StockRequestReservationLine[]>(
      toApiUrl(`/api/stock-requests/reservations?item_id=${encodeURIComponent(itemId)}`),
    ),

  // Stock request drafts (직원별 저장형 입출고 장바구니) -------------------
  upsertStockRequestDraft: (payload: StockRequestDraftUpsertPayload) => {
    const request = toOpenApiStockRequestDraftUpsert(payload);
    return putJson<RawStockRequestResponse>(
      toApiUrl("/api/stock-requests/draft"), request,
    ).then(fromOpenApiStockRequestMutation);
  },

  getStockRequestDraft: (
    requesterEmployeeId: string,
    requestType: StockRequestCommandType,
  ): Promise<StockRequest | null> =>
    fetcher<RawStockRequestResponse | null>(
      toApiUrl(
        `/api/stock-requests/draft?requester_employee_id=${encodeURIComponent(
          requesterEmployeeId,
        )}&request_type=${encodeURIComponent(requestType)}`,
      ),
    ).then((raw) => raw ? fromOpenApiStockRequest(raw) : null),

  listStockRequestDrafts: (requesterEmployeeId: string) =>
    fetcher<RawStockRequestResponse[]>(
      toApiUrl(
        `/api/stock-requests/drafts?requester_employee_id=${encodeURIComponent(
          requesterEmployeeId,
        )}`,
      ),
    ).then(fromOpenApiStockRequestList),

  deleteStockRequestDraft: (requestId: string, requesterEmployeeId: string) =>
    deleteJson<void>(
      toApiUrl(
        `/api/stock-requests/draft/${requestId}?requester_employee_id=${encodeURIComponent(
          requesterEmployeeId,
        )}`,
      ),
    ),

  submitStockRequestDraft: (requestId: string, requesterEmployeeId: string) =>
    postJson<RawStockRequestResponse>(toApiUrl(`/api/stock-requests/${requestId}/submit`), {
      requester_employee_id: requesterEmployeeId,
    }).then(fromOpenApiStockRequestMutation),
};
