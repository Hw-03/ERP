import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TransactionLog } from "@/lib/api";
import { MobileHistoryList } from "../MobileHistoryList";

function log(id: string, phase: string): TransactionLog {
  return {
    log_id: id,
    item_id: `item-${id}`,
    item_name: `Shipping item ${id}`,
    mes_code: `SHIP-${id}`,
    transaction_type: "SHIP",
    quantity_change: -1,
    quantity_before: 2,
    quantity_after: 1,
    warehouse_qty_before: 2,
    warehouse_qty_after: 1,
    production_qty_before: 0,
    production_qty_after: 0,
    defective_qty_before: 0,
    defective_qty_after: 0,
    reference_no: "SHIP-REQ-1",
    shipping_phase: phase,
    produced_by: "operator",
    notes: null,
    created_at: "2026-07-06T00:00:00Z",
    requested_at: "2026-07-06T00:00:00Z",
    cancelled: false,
    cancel_reason: null,
    cancelled_at: null,
    operation_batch_id: null,
    inventory_effect: [{ scope: "warehouse", delta: -1 }],
  } as TransactionLog;
}

describe("MobileHistoryList", () => {
  it("uses the phase-aware batch key when duplicate shipping reference numbers exist", () => {
    const onSelectBatch = vi.fn();

    render(
      <MobileHistoryList
        loading={false}
        filteredLogs={[
          log("prepare-1", "PREPARE"),
          log("prepare-2", "PREPARE"),
          log("pickup-1", "PICKUP"),
          log("pickup-2", "PICKUP"),
        ]}
        selectedKey={null}
        onSelectLog={vi.fn()}
        onSelectBatch={onSelectBatch}
        canLoadMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
      />,
    );

    const batchCards = screen.getAllByRole("button");
    expect(batchCards).toHaveLength(2);

    fireEvent.click(batchCards[0]);
    fireEvent.click(batchCards[1]);

    expect(onSelectBatch.mock.calls.map((call) => call[0])).toEqual([
      "SHIP-REQ-1::PREPARE",
      "SHIP-REQ-1::PICKUP",
    ]);
  });
});
