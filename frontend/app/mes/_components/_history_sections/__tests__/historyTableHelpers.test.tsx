import { describe, expect, it } from "vitest";
import type { TransactionLog } from "@/lib/api/types/production";
import { buildGroups } from "../historyTableHelpers";

function makeLog(overrides: Partial<TransactionLog> = {}): TransactionLog {
  return {
    log_id: "log-1",
    item_id: "ITEM-1",
    mes_code: "AX-001",
    item_name: "AX-100",
    item_process_type_code: "AF",
    item_unit: "EA",
    transaction_type: "SHIP",
    quantity_change: -1,
    quantity_before: 2,
    quantity_after: 1,
    warehouse_qty_before: null,
    warehouse_qty_after: null,
    transfer_qty: 1,
    reference_no: "SHIP-REQ-1",
    produced_by: null,
    requester_name: null,
    approver_name: null,
    requested_at: "2026-07-02T01:00:00Z",
    approved_at: null,
    department: "조립",
    notes: null,
    operation_batch_id: null,
    created_at: "2026-07-02T01:00:00Z",
    edit_count: 0,
    cancelled: false,
    cancel_reason: null,
    cancelled_by: null,
    cancelled_at: null,
    inventory_effect: null,
    shipping_phase: null,
    ...overrides,
  };
}

describe("buildGroups shipping phase grouping", () => {
  it("separates prepare and pickup logs that share a shipping request reference", () => {
    const groups = buildGroups([
      makeLog({ log_id: "prep-pa", transaction_type: "BACKFLUSH", shipping_phase: "PREPARE", item_id: "PA" }),
      makeLog({ log_id: "prep-pf", transaction_type: "PRODUCE", shipping_phase: "PREPARE", item_id: "PF" }),
      makeLog({ log_id: "pickup-pf", transaction_type: "SHIP", shipping_phase: "PICKUP", item_id: "PF" }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ type: "batch", refNo: "SHIP-REQ-1", refKey: "SHIP-REQ-1::PREPARE" });
    expect(groups[1]).toMatchObject({ type: "solo" });
    if (groups[0].type === "batch") {
      expect(groups[0].logs.map((log) => log.shipping_phase)).toEqual(["PREPARE", "PREPARE"]);
    }
    if (groups[1].type === "solo") {
      expect(groups[1].log.shipping_phase).toBe("PICKUP");
    }
  });
});
