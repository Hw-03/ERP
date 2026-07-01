import { describe, expect, it } from "vitest";
import type { TransactionLog } from "@/lib/api/types/production";
import { buildReworkItemSummaries } from "../reworkSummary";

function makeLog(overrides: Partial<TransactionLog> = {}): TransactionLog {
  return {
    log_id: "log-1",
    item_id: "ITEM-1",
    mes_code: "3-AA-0018",
    item_name: "DX3000 에어라이트 플레이트 ASS'Y",
    item_process_type_code: "AA",
    item_unit: "EA",
    transaction_type: "DEFECT_SCRAP",
    quantity_change: -199,
    quantity_before: 200,
    quantity_after: 1,
    warehouse_qty_before: null,
    warehouse_qty_after: null,
    transfer_qty: 199,
    reference_no: "defect-disassemble:parent",
    produced_by: null,
    requester_name: "김민재",
    approver_name: "김민재",
    requested_at: "2026-06-29T00:00:00Z",
    approved_at: "2026-06-29T00:00:00Z",
    department: "조립",
    notes: null,
    operation_batch_id: null,
    created_at: "2026-06-29T00:00:00Z",
    edit_count: 0,
    cancelled: false,
    cancel_reason: null,
    cancelled_by: null,
    cancelled_at: null,
    inventory_effect: null,
    ...overrides,
  };
}

describe("buildReworkItemSummaries", () => {
  it("combines scrap and recovery logs for the same item into one row summary", () => {
    const summaries = buildReworkItemSummaries([
      makeLog({ log_id: "scrap", transaction_type: "DEFECT_SCRAP", quantity_change: -199, transfer_qty: 199 }),
      makeLog({ log_id: "recover", transaction_type: "RECEIVE", quantity_change: 1, transfer_qty: 1 }),
    ]);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      itemId: "ITEM-1",
      mesCode: "3-AA-0018",
      itemName: "DX3000 에어라이트 플레이트 ASS'Y",
      scrapQty: 199,
      recoverQty: 1,
      unit: "EA",
      excluded: false,
    });
    expect(summaries[0].resultLabel).toBe("폐기 199 EA · 회수 1 EA");
  });

  it("keeps scrap-only, recovery-only, and excluded rows explicit", () => {
    const summaries = buildReworkItemSummaries([
      makeLog({ log_id: "scrap-only", item_id: "SCRAP", mes_code: "6-AA-0001", item_name: "폐기만", transaction_type: "DEFECT_SCRAP", quantity_change: -3, transfer_qty: 3 }),
      makeLog({ log_id: "recover-only", item_id: "KEEP", mes_code: "6-AA-0002", item_name: "회수만", transaction_type: "RECEIVE", quantity_change: 2, transfer_qty: 2 }),
      makeLog({ log_id: "excluded", item_id: "EXCLUDED", mes_code: "6-AA-0003", item_name: "처리 제외", transaction_type: "BACKFLUSH", quantity_change: 0, transfer_qty: 0 }),
    ]);

    expect(summaries.map((summary) => summary.resultLabel)).toEqual([
      "폐기 3 EA",
      "회수 2 EA",
      "처리 제외",
    ]);
    expect(summaries[2].excluded).toBe(true);
  });
});