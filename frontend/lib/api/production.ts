/**
 * Production / History (transactions) / Exports — `@/lib/api/production`.
 *
 * Round-6 (R6-D7) 분리. 9 메소드:
 *   Production: productionReceipt / checkProduction / getProductionCapacity
 *   Transactions: getTransactions / metaEditTransaction / getTransactionEdits / quantityCorrectTransaction
 *   Exports: getItemsExportUrl / getTransactionsExportUrl
 */

import { fetcher, postJson, toApiUrl } from "../api-core";
import type { operations } from "./generated/openapi";
import {
  fieldsMatch,
  isNullableString,
  isRecord,
  isString,
  isStringArray,
} from "./openapi-runtime";
import type {
  ProductionCapacity,
  ProductionCheckResponse,
  ProductionReceiptResponse,
  TransactionEditLog,
  TransactionLog,
  TransactionType,
  InventoryOperation,
  InventoryOperationLine,
  InventoryOperationPage,
  InventoryOperationCancellationPreview,
} from "./types";

/** 입출고 내역 KPI 응답 — 카운트 4개. */
export interface TransactionSummary {
  total: number;
  warehouseCount: number;
  deptCount: number;
  adjustCount: number;
  /** dept-bucket 거래의 부서별 카운트 {부서명: 건수}. 배치/부서 없으면 '미상'. */
  departmentCounts: Record<string, number>;
}

export interface TransactionReferenceSummary {
  referenceNo: string;
  shippingPhase: string | null;
  logCount: number;
  itemCount: number;
  totalQuantity: number;
  unit: string | null;
}

export type TransactionDisplayGroupType = "solo" | "batch" | "op_batch" | "operation" | "defect_lifecycle";

export interface TransactionDisplayGroup {
  type: TransactionDisplayGroupType;
  key: string;
  logs: TransactionLog[];
}

export interface TransactionDisplayGroupPage {
  groups: TransactionDisplayGroup[];
  nextCursor: string | null;
  hasMore: boolean;
}

type InventoryOperationLineWire = {
  log_id: string;
  item_id: string;
  item_name: string | null;
  mes_code: string | null;
  transaction_type: TransactionType;
  quantity_change: string | number;
  quantity_before: string | number | null;
  quantity_after: string | number | null;
  transfer_qty: string | number | null;
  department: string | null;
  operation_role: string | null;
  reverses_log_id: string | null;
  reference_no: string | null;
  notes: string | null;
  created_at: string;
};

type InventoryOperationWire = {
  operation_id: string;
  kind: "BUSINESS" | "CANCELLATION";
  domain: string;
  action: string;
  display_label: string;
  effective_status: "active" | "cancelled" | "cancellation";
  actor_employee_id: string | null;
  actor_name: string;
  department: string | null;
  reason: string | null;
  effective_at: string;
  reverses_operation_id: string | null;
  reversal_operation_id: string | null;
  can_cancel: boolean;
  cancel_blockers: string[];
  cancel_warnings: string[];
  lines: InventoryOperationLineWire[];
  matching_lines: InventoryOperationLineWire[];
  effects: Array<{
    effect_id: string;
    effect_kind: string;
    subject_type: string;
    subject_id: string;
    role: string;
    before_state: Record<string, unknown>;
    after_state: Record<string, unknown>;
    reverses_effect_id: string | null;
  }>;
};

type InventoryOperationCancellationPreviewWire = {
  operation_id: string;
  plan_hash: string;
  can_cancel: boolean;
  blockers: string[];
  warnings: string[];
  cells: Array<{
    item_id: string;
    scope: string;
    department: string | null;
    status: string | null;
    row_id: string | null;
    box_id: string | null;
    zone_id: string | number | null;
    quantity_change: string | number;
    current_quantity: string | number;
    reserved_quantity: string | number;
    quantity_after: string | number;
  }>;
  defect_records: Array<Record<string, unknown>>;
  effects: Array<Record<string, unknown>>;
};

type OpenApiInventoryOperationPage =
  operations["list_operations_api_inventory_operations_get"]["responses"][200]["content"]["application/json"];
type OpenApiInventoryOperationCancellationPreview =
  operations["preview_operation_cancel_api_inventory_operations__operation_id__cancel_preview_post"]["responses"][200]["content"]["application/json"];
type OpenApiInventoryOperationCancellationResult =
  operations["cancel_operation_api_inventory_operations__operation_id__cancel_post"]["responses"][200]["content"]["application/json"];

const TRANSACTION_TYPES = new Set<string>([
  "RECEIVE",
  "PRODUCE",
  "SHIP",
  "ADJUST",
  "BACKFLUSH",
  "DISASSEMBLE",
  "TRANSFER_TO_PROD",
  "TRANSFER_TO_WH",
  "TRANSFER_DEPT",
  "MARK_DEFECTIVE",
  "UNMARK_DEFECTIVE",
  "DEFECT_SCRAP",
  "SUPPLIER_RETURN",
  "INTERNAL_USE",
]);

function isWireNumber(value: unknown): value is string | number {
  return (
    (typeof value === "number" && Number.isFinite(value))
    || (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)))
  );
}

function isNullableWireNumber(value: unknown): value is string | number | null {
  return value === null || isWireNumber(value);
}

function isInventoryOperationLineWire(value: unknown): value is InventoryOperationLineWire {
  return (
    isRecord(value)
    && fieldsMatch(value, ["log_id", "item_id", "created_at"], isString)
    && fieldsMatch(
      value,
      [
        "item_name",
        "mes_code",
        "department",
        "operation_role",
        "reverses_log_id",
        "reference_no",
        "notes",
      ],
      isNullableString,
    )
    && typeof value.transaction_type === "string"
    && TRANSACTION_TYPES.has(value.transaction_type)
    && fieldsMatch(value, ["quantity_change"], isWireNumber)
    && fieldsMatch(
      value,
      ["quantity_before", "quantity_after", "transfer_qty"],
      isNullableWireNumber,
    )
  );
}

function isInventoryOperationEffectWire(
  value: unknown,
): value is InventoryOperationWire["effects"][number] {
  return (
    isRecord(value)
    && fieldsMatch(
      value,
      ["effect_id", "effect_kind", "subject_type", "subject_id", "role"],
      isString,
    )
    && isRecord(value.before_state)
    && isRecord(value.after_state)
    && isNullableString(value.reverses_effect_id)
  );
}

function isInventoryOperationWire(value: unknown): value is InventoryOperationWire {
  return (
    isRecord(value)
    && fieldsMatch(
      value,
      ["operation_id", "domain", "action", "display_label", "actor_name", "effective_at"],
      isString,
    )
    && (value.kind === "BUSINESS" || value.kind === "CANCELLATION")
    && (
      value.effective_status === "active"
      || value.effective_status === "cancelled"
      || value.effective_status === "cancellation"
    )
    && fieldsMatch(
      value,
      [
        "actor_employee_id",
        "department",
        "reason",
        "reverses_operation_id",
        "reversal_operation_id",
      ],
      isNullableString,
    )
    && typeof value.can_cancel === "boolean"
    && isStringArray(value.cancel_blockers)
    && isStringArray(value.cancel_warnings)
    && Array.isArray(value.lines)
    && value.lines.every(isInventoryOperationLineWire)
    && Array.isArray(value.matching_lines)
    && value.matching_lines.every(isInventoryOperationLineWire)
    && Array.isArray(value.effects)
    && value.effects.every(isInventoryOperationEffectWire)
  );
}

function parseInventoryOperation(raw: unknown): InventoryOperationWire {
  if (!isInventoryOperationWire(raw)) {
    throw new Error("입출고 작업 응답 형식이 올바르지 않습니다.");
  }
  return raw;
}

function isCancellationPreviewCellWire(
  value: unknown,
): value is InventoryOperationCancellationPreviewWire["cells"][number] {
  return (
    isRecord(value)
    && fieldsMatch(value, ["item_id", "scope"], isString)
    && fieldsMatch(
      value,
      ["department", "status", "row_id", "box_id"],
      isNullableString,
    )
    && (
      value.zone_id === null
      || typeof value.zone_id === "string"
      || (typeof value.zone_id === "number" && Number.isFinite(value.zone_id))
    )
    && fieldsMatch(
      value,
      ["quantity_change", "current_quantity", "reserved_quantity", "quantity_after"],
      isWireNumber,
    )
  );
}

function isInventoryOperationCancellationPreviewWire(
  value: unknown,
): value is InventoryOperationCancellationPreviewWire {
  return (
    isRecord(value)
    && fieldsMatch(value, ["operation_id", "plan_hash"], isString)
    && typeof value.can_cancel === "boolean"
    && isStringArray(value.blockers)
    && isStringArray(value.warnings)
    && Array.isArray(value.cells)
    && value.cells.every(isCancellationPreviewCellWire)
    && Array.isArray(value.defect_records)
    && value.defect_records.every(isRecord)
    && Array.isArray(value.effects)
    && value.effects.every(isRecord)
  );
}

function parseInventoryOperationCancellationPreview(
  raw: OpenApiInventoryOperationCancellationPreview,
): InventoryOperationCancellationPreviewWire {
  if (!isInventoryOperationCancellationPreviewWire(raw)) {
    throw new Error("입출고 작업 취소 미리보기 응답 형식이 올바르지 않습니다.");
  }
  return raw;
}

function parseInventoryOperationPage(raw: OpenApiInventoryOperationPage): {
  items: InventoryOperationWire[];
  next_cursor: string | null;
} {
  if (
    !isRecord(raw)
    || !Array.isArray(raw.items)
    || (raw.next_cursor !== null && typeof raw.next_cursor !== "string")
  ) {
    throw new Error("입출고 작업 목록 응답 형식이 올바르지 않습니다.");
  }

  const items = raw.items.map((operation) => {
    return parseInventoryOperation(operation);
  });

  return { items, next_cursor: raw.next_cursor };
}

function mapWire<T>(wire: object): T {
  return Object.fromEntries(Object.entries(wire).map(([key, value]) => [
    key.replace(/_./g, (part) => part[1].toUpperCase()),
    value != null && (key.includes("quantity") || key === "transfer_qty")
      ? Number(value)
      : value,
  ])) as T;
}

function apiQuery<T extends object>(path: string, params?: T): string {
  const query = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value == null || value === false || value === "") return;
    query.set(key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), String(value));
  });
  const suffix = query.toString();
  return toApiUrl(`${path}${suffix ? `?${suffix}` : ""}`);
}

function mapInventoryOperation(operation: InventoryOperationWire): InventoryOperation {
  const mapped = mapWire<InventoryOperation>(operation);
  mapped.lines = operation.lines.map((line) => mapWire<InventoryOperationLine>(line));
  mapped.matchingLines = operation.matching_lines.map((line) => mapWire<InventoryOperationLine>(line));
  mapped.effects = operation.effects.map((effect) => mapWire(effect));
  return mapped;
}

function mapInventoryOperationCancellationPreview(
  preview: InventoryOperationCancellationPreviewWire,
): InventoryOperationCancellationPreview {
  const mapped = mapWire<InventoryOperationCancellationPreview>(preview);
  mapped.cells = preview.cells.map((cell) => mapWire(cell));
  return mapped;
}

export const productionApi = {
  getInventoryOperations: (
    params?: { itemId?: string; limit?: number; cursor?: string | null },
    opts?: { signal?: AbortSignal },
  ): Promise<InventoryOperationPage> => {
    return fetcher<OpenApiInventoryOperationPage>(
      apiQuery("/api/inventory/operations", params),
      opts?.signal,
    )
      .then(parseInventoryOperationPage)
      .then((page) => ({
        items: page.items.map(mapInventoryOperation),
        nextCursor: page.next_cursor,
      }));
  },

  previewInventoryOperationCancellation: (
    operationId: string,
  ): Promise<InventoryOperationCancellationPreview> =>
    postJson<OpenApiInventoryOperationCancellationPreview>(
      toApiUrl(`/api/inventory/operations/${encodeURIComponent(operationId)}/cancel/preview`),
      {},
    )
      .then(parseInventoryOperationCancellationPreview)
      .then(mapInventoryOperationCancellationPreview),

  cancelInventoryOperation: (
    operationId: string,
    payload: {
      reason: string;
      employee_code: string;
      pin: string;
      plan_hash: string;
    },
  ): Promise<InventoryOperation> =>
    postJson<OpenApiInventoryOperationCancellationResult>(
      toApiUrl(`/api/inventory/operations/${encodeURIComponent(operationId)}/cancel`),
      payload,
    ).then(parseInventoryOperation).then(mapInventoryOperation),

  productionReceipt: (payload: {
    item_id: string;
    quantity: number;
    reference_no?: string;
    produced_by?: string;
    notes?: string;
  }) => postJson<ProductionReceiptResponse>(toApiUrl("/api/production/receipt"), payload),

  checkProduction: (itemId: string, quantity: number) =>
    fetcher<ProductionCheckResponse>(
      toApiUrl(`/api/production/bom-check/${itemId}?quantity=${quantity}`),
    ),

  getProductionCapacity: () =>
    fetcher<ProductionCapacity>(toApiUrl("/api/production/capacity")),

  getTransactions: (
    params?: {
      itemId?: string;
      transactionType?: TransactionType;
      transactionTypes?: string; // 쉼표 구분 복수값. 예: "RECEIVE,SHIP"
      operationKeys?: string; // 화면 거래 종류. 예: "item_conversion,shipping_prepare"
      operationId?: string;
      operationBatchId?: string;
      referenceNo?: string;
      search?: string;
      department?: string;
      model?: string;        // 제품 모델명 (쉼표 복수)
      processStep?: string;  // 공정 구분 R/A/F (쉼표 복수)
      dateFrom?: string; // YYYY-MM-DD
      dateTo?: string;   // YYYY-MM-DD
      includeArchived?: boolean;
      unlinkedOnly?: boolean;
      limit?: number;
      skip?: number;
    },
    opts?: { signal?: AbortSignal },
  ) => {
    return fetcher<TransactionLog[]>(
      apiQuery("/api/inventory/transactions", params),
      opts?.signal,
    );
  },

  /** 입출고 내역 KPI 카드 — 조건 전체 카운트 (페이지네이션과 무관). */
  getTransactionsSummary: (
    params?: {
      transactionTypes?: string;
      operationKeys?: string;
      search?: string;
      department?: string;
      model?: string;
      processStep?: string;
      dateFrom?: string;
      dateTo?: string;
      includeArchived?: boolean;
    },
    opts?: { signal?: AbortSignal },
  ): Promise<TransactionSummary> => {
    return fetcher<{
      total: number;
      warehouse_count: number;
      dept_count: number;
      adjust_count: number;
      department_counts: Record<string, number>;
    }>(
      apiQuery("/api/inventory/transactions/summary", params),
      opts?.signal,
    ).then((result) => mapWire<TransactionSummary>(result));
  },

  getTransactionDisplayGroups: (
    params?: {
      transactionTypes?: string;
      operationKeys?: string;
      search?: string;
      department?: string;
      model?: string;
      processStep?: string;
      dateFrom?: string;
      dateTo?: string;
      includeArchived?: boolean;
      limit?: number;
      cursor?: string | null;
    },
    opts?: { signal?: AbortSignal },
  ): Promise<TransactionDisplayGroupPage> => {
    return fetcher<{
      groups: TransactionDisplayGroup[];
      next_cursor: string | null;
      has_more: boolean;
    }>(
      apiQuery("/api/inventory/transactions/display-groups", params),
      opts?.signal,
    ).then((page) => mapWire<TransactionDisplayGroupPage>(page));
  },

  /** 페이지네이션과 무관한 참조번호 묶음별 전체 요약. */
  getTransactionReferenceSummaries: (
    params?: {
      transactionTypes?: string;
      operationKeys?: string;
      search?: string;
      department?: string;
      model?: string;
      processStep?: string;
      dateFrom?: string;
      dateTo?: string;
      includeArchived?: boolean;
    },
    opts?: { signal?: AbortSignal },
  ): Promise<TransactionReferenceSummary[]> => {
    return fetcher<Array<{
      reference_no: string;
      shipping_phase: string | null;
      log_count: number;
      item_count: number;
      total_quantity: number;
      unit: string | null;
    }>>(
      apiQuery("/api/inventory/transactions/reference-summaries", params),
      opts?.signal,
    ).then((rows) => rows.map((row) => mapWire<TransactionReferenceSummary>(row)));
  },

  /** 거래 메타데이터(notes/reference_no/produced_by) 수정. reason + PIN 필수. */
  metaEditTransaction: (
    logId: string,
    payload: {
      notes?: string | null;
      reference_no?: string | null;
      produced_by?: string | null;
      reason: string;
      edited_by_employee_id: string;
      edited_by_pin: string;
    },
  ) =>
    postJson<TransactionLog>(
      toApiUrl(`/api/inventory/transactions/${logId}/meta-edit`),
      payload,
    ),

  /** 특정 거래의 수정 이력 (최신순). */
  getTransactionEdits: (
    logId: string,
    opts?: { signal?: AbortSignal },
  ): Promise<TransactionEditLog[]> =>
    fetcher<TransactionEditLog[]>(
      toApiUrl(`/api/inventory/transactions/${logId}/edits`),
      opts?.signal,
    ),

  /** RECEIVE/SHIP 수량 보정. SHIP은 quantity_change가 음수여야 함. */
  quantityCorrectTransaction: (
    logId: string,
    payload: {
      quantity_change: number;
      reason: string;
      edited_by_employee_id: string;
      edited_by_pin: string;
    },
  ) =>
    postJson<{ original: TransactionLog; correction: TransactionLog }>(
      toApiUrl(`/api/inventory/transactions/${logId}/quantity-correction`),
      payload,
    ),

  cancelTransaction: (
    logId: string,
    payload: { reason: string; employee_code: string; pin: string },
  ) =>
    postJson<TransactionLog>(
      toApiUrl(`/api/inventory/transactions/${logId}/cancel`),
      payload,
    ),

  /** 주어진 year의 월별 거래 건수. { "2026-01": 142, ..., "2026-12": 0 } */
  getMonthlyCounts: (year: number): Promise<Record<string, number>> =>
    fetcher<Record<string, number>>(toApiUrl(`/api/inventory/transactions/monthly-counts?year=${year}`)),

  getItemsExportUrl: (params?: { category?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set("category", params.category);
    if (params?.search) qs.set("search", params.search);
    const suffix = qs.toString() ? `?${qs}` : "";
    return toApiUrl(`/api/items/export.xlsx${suffix}`);
  },

  getTransactionsExportUrl: (params?: {
    transaction_type?: string;
    search?: string;
    start_date?: string; // YYYY-MM-DD
    end_date?: string; // YYYY-MM-DD
  }) => {
    const qs = new URLSearchParams();
    if (params?.transaction_type) qs.set("transaction_type", params.transaction_type);
    if (params?.search) qs.set("search", params.search);
    // backend export endpoint 가 start_date/end_date 둘 다 필수.
    // 미지정 시 최근 30일(오늘 포함, D-29 ~ 오늘)을 자동 부여한다.
    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() - 29);
    const ymd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
    qs.set("start_date", params?.start_date ?? ymd(from));
    qs.set("end_date", params?.end_date ?? ymd(today));
    return toApiUrl(`/api/inventory/transactions/export.xlsx?${qs}`);
  },
};
