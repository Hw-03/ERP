import { http, HttpResponse } from "msw";
import type { TransactionLog, TransactionEditLog } from "@/lib/api/types/production";

const sampleTransactions: TransactionLog[] = [
  {
    log_id: "log-1",
    item_id: "item-1",
    mes_code: "MC-001",
    item_name: "메인 커버",
    item_process_type_code: "TR",
    item_unit: "EA",
    transaction_type: "RECEIVE",
    quantity_change: 10,
    quantity_before: 0,
    quantity_after: 10,
    transfer_qty: null,
    reference_no: "REF-001",
    produced_by: null,
    requester_name: "홍길동",
    approver_name: "홍길동",
    notes: null,
    operation_batch_id: null,
    created_at: "2026-05-01T09:00:00Z",
    edit_count: 0,
    warehouse_qty_before: null,
    warehouse_qty_after: null,
    department: null,
    cancelled: false,
    cancel_reason: null,
    cancelled_by: null,
    cancelled_at: null,
  },
  {
    log_id: "log-2",
    item_id: "item-2",
    mes_code: "MC-002",
    item_name: "하우징",
    item_process_type_code: "TA",
    item_unit: "EA",
    transaction_type: "SHIP",
    quantity_change: -5,
    quantity_before: 20,
    quantity_after: 15,
    transfer_qty: null,
    reference_no: null,
    produced_by: null,
    requester_name: null,
    approver_name: null,
    notes: null,
    operation_batch_id: null,
    created_at: "2026-05-02T10:00:00Z",
    edit_count: 0,
    warehouse_qty_before: null,
    warehouse_qty_after: null,
    department: null,
    cancelled: false,
    cancel_reason: null,
    cancelled_by: null,
    cancelled_at: null,
  },
];

const sampleEditLog: TransactionEditLog[] = [
  {
    edit_id: "edit-1",
    original_log_id: "log-1",
    edited_by_employee_id: "emp-1",
    edited_by_name: "홍길동",
    reason: "오입력 수정",
    before_payload: JSON.stringify({ notes: null }),
    after_payload: JSON.stringify({ notes: "수정됨" }),
    correction_log_id: null,
    created_at: "2026-05-03T08:00:00Z",
  },
];

const sampleMonthlyCounts: Record<string, number> = {
  "2026-01": 0, "2026-02": 0, "2026-03": 5, "2026-04": 0,
  "2026-05": 142, "2026-06": 0, "2026-07": 89, "2026-08": 0,
  "2026-09": 0, "2026-10": 0, "2026-11": 0, "2026-12": 0,
};

export const transactionsHandlers = [
  http.get("*/api/inventory/transactions/monthly-counts", ({ request }) => {
    const url = new URL(request.url);
    const year = url.searchParams.get("year");
    if (!year || isNaN(Number(year)) || Number(year) < 2020 || Number(year) > 2100) {
      return HttpResponse.json({ detail: "year 범위 오류" }, { status: 422 });
    }
    return HttpResponse.json(sampleMonthlyCounts);
  }),

  http.get("*/api/inventory/transactions", () =>
    HttpResponse.json(sampleTransactions),
  ),

  http.get("*/api/inventory/transactions/summary", () =>
    HttpResponse.json({
      total: 2,
      warehouse_count: 1,
      dept_count: 1,
      adjust_count: 0,
      department_counts: { 조립: 1 },
    }),
  ),

  http.get("*/api/inventory/transactions/:logId/edits", ({ params }) => {
    if (params.logId === "log-1") return HttpResponse.json(sampleEditLog);
    return HttpResponse.json([]);
  }),

  http.post("*/api/inventory/transactions/:logId/meta-edit", async ({ params, request }) => {
    const body = (await request.json()) as { edited_by_pin: string };
    if (body.edited_by_pin !== "0000")
      return HttpResponse.json({ detail: "PIN 불일치" }, { status: 403 });
    return HttpResponse.json({ ...sampleTransactions[0], log_id: String(params.logId) });
  }),

  http.post("*/api/inventory/transactions/:logId/quantity-correction", async ({ params, request }) => {
    const body = (await request.json()) as { edited_by_pin: string };
    if (body.edited_by_pin !== "0000")
      return HttpResponse.json({ detail: "PIN 불일치" }, { status: 403 });
    return HttpResponse.json({
      original: { ...sampleTransactions[0], log_id: String(params.logId) },
      correction: { ...sampleTransactions[0], log_id: "log-corr" },
    });
  }),
];
