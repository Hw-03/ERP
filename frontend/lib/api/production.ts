/**
 * Production / History (transactions) / Exports — `@/lib/api/production`.
 *
 * Round-6 (R6-D7) 분리. 9 메소드:
 *   Production: productionReceipt / checkProduction / getProductionCapacity
 *   Transactions: getTransactions / metaEditTransaction / getTransactionEdits / quantityCorrectTransaction
 *   Exports: getItemsExportUrl / getTransactionsExportUrl
 */

import { fetcher, parseError, toApiUrl } from "../api-core";
import type {
  ProductionCapacity,
  ProductionCheckResponse,
  ProductionReceiptResponse,
  TransactionEditLog,
  TransactionLog,
  TransactionType,
} from "./types";

export const productionApi = {
  productionReceipt: async (payload: {
    item_id: string;
    quantity: number;
    reference_no?: string;
    produced_by?: string;
    notes?: string;
  }) => {
    const res = await fetch(toApiUrl("/api/production/receipt"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<ProductionReceiptResponse>;
  },

  checkProduction: (itemId: string, quantity: number) =>
    fetcher<ProductionCheckResponse>(toApiUrl(`/api/production/bom-check/${itemId}?quantity=${quantity}`)),

  getProductionCapacity: () =>
    fetcher<ProductionCapacity>(toApiUrl("/api/production/capacity")),

  getTransactions: (
    params?: {
      itemId?: string;
      transactionType?: TransactionType;
      referenceNo?: string;
      search?: string;
      limit?: number;
      skip?: number;
    },
    opts?: { signal?: AbortSignal },
  ) => {
    const query = new URLSearchParams();
    if (params?.itemId) query.set("item_id", params.itemId);
    if (params?.transactionType) query.set("transaction_type", params.transactionType);
    if (params?.referenceNo) query.set("reference_no", params.referenceNo);
    if (params?.search) query.set("search", params.search);
    if (params?.limit !== undefined) query.set("limit", String(params.limit));
    if (params?.skip !== undefined) query.set("skip", String(params.skip));
    return fetcher<TransactionLog[]>(toApiUrl(`/api/inventory/transactions?${query}`), opts?.signal);
  },

  /** 거래 메타데이터(notes/reference_no/produced_by) 수정. reason + PIN 필수. */
  metaEditTransaction: async (
    logId: string,
    payload: {
      notes?: string | null;
      reference_no?: string | null;
      produced_by?: string | null;
      reason: string;
      edited_by_employee_id: string;
      edited_by_pin: string;
    },
  ): Promise<TransactionLog> => {
    const res = await fetch(toApiUrl(`/api/inventory/transactions/${logId}/meta-edit`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<TransactionLog>;
  },

  /** 특정 거래의 수정 이력 (최신순). */
  getTransactionEdits: (logId: string): Promise<TransactionEditLog[]> =>
    fetcher<TransactionEditLog[]>(toApiUrl(`/api/inventory/transactions/${logId}/edits`)),

  /** RECEIVE/SHIP 수량 보정. SHIP은 quantity_change가 음수여야 함. */
  quantityCorrectTransaction: async (
    logId: string,
    payload: {
      quantity_change: number;
      reason: string;
      edited_by_employee_id: string;
      edited_by_pin: string;
    },
  ): Promise<{ original: TransactionLog; correction: TransactionLog }> => {
    const res = await fetch(
      toApiUrl(`/api/inventory/transactions/${logId}/quantity-correction`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<{ original: TransactionLog; correction: TransactionLog }>;
  },

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
    end_date?: string;   // YYYY-MM-DD
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
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    qs.set("start_date", params?.start_date ?? ymd(from));
    qs.set("end_date", params?.end_date ?? ymd(today));
    return toApiUrl(`/api/inventory/transactions/export.xlsx?${qs}`);
  },
};
