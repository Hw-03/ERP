/**
 * Production / History (transactions) / Exports — `@/lib/api/production`.
 *
 * Round-6 (R6-D7) 분리. 9 메소드:
 *   Production: productionReceipt / checkProduction / getProductionCapacity
 *   Transactions: getTransactions / metaEditTransaction / getTransactionEdits / quantityCorrectTransaction
 *   Exports: getItemsExportUrl / getTransactionsExportUrl
 */

import { fetcher, postJson, toApiUrl } from "../api-core";
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
  cells: Array<{
    item_id: string;
    scope: string;
    department: string | null;
    status: string | null;
    box_id: string | null;
    quantity_change: string | number;
    current_quantity: string | number;
    reserved_quantity: string | number;
    quantity_after: string | number;
  }>;
  defect_records: Array<Record<string, unknown>>;
  effects: Array<Record<string, unknown>>;
};

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
    return fetcher<{ items: InventoryOperationWire[]; next_cursor: string | null }>(
      apiQuery("/api/inventory/operations", params),
      opts?.signal,
    ).then((page) => ({
      items: page.items.map(mapInventoryOperation),
      nextCursor: page.next_cursor,
    }));
  },

  previewInventoryOperationCancellation: (
    operationId: string,
  ): Promise<InventoryOperationCancellationPreview> =>
    postJson<InventoryOperationCancellationPreviewWire>(
      toApiUrl(`/api/inventory/operations/${encodeURIComponent(operationId)}/cancel/preview`),
      {},
    ).then(mapInventoryOperationCancellationPreview),

  cancelInventoryOperation: (
    operationId: string,
    payload: {
      reason: string;
      employee_code: string;
      pin: string;
      plan_hash: string;
    },
  ): Promise<InventoryOperation> =>
    postJson<InventoryOperationWire>(
      toApiUrl(`/api/inventory/operations/${encodeURIComponent(operationId)}/cancel`),
      payload,
    ).then(mapInventoryOperation),

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
