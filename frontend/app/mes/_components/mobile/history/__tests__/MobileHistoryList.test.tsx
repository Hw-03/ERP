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
  it("selects only the original defect-mark log for a visual defect lifecycle group", () => {
    const onSelectLog = vi.fn();
    const onSelectBatch = vi.fn();
    const marked = {
      ...log("marked", ""),
      item_id: "same-item",
      transaction_type: "MARK_DEFECTIVE",
      quantity_change: -1,
      reference_no: null,
      shipping_phase: null,
      department: "\uC870\uB9BD",
      reason_category: "\uD30C\uC190",
      produced_by: "operator",
      created_at: "2026-07-10T08:00:00Z",
    } as TransactionLog;
    const processed = {
      ...marked,
      log_id: "processed",
      transaction_type: "DEFECT_SCRAP",
      created_at: "2026-07-10T08:00:30Z",
    } as TransactionLog;

    render(
      <MobileHistoryList
        loading={false}
        error={null}
        filteredLogs={[marked, processed]}
        selectedKey={null}
        onSelectLog={onSelectLog}
        onSelectBatch={onSelectBatch}
        onRetry={vi.fn()}
        canLoadMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button"));
    expect(onSelectLog).toHaveBeenCalledWith(marked);
    expect(onSelectBatch).not.toHaveBeenCalled();
  });

  it("uses the phase-aware batch key when duplicate shipping reference numbers exist", () => {
    const onSelectBatch = vi.fn();

    render(
      <MobileHistoryList
        loading={false}
        error={null}
        filteredLogs={[
          log("prepare-1", "PREPARE"),
          log("prepare-2", "PREPARE"),
          log("pickup-1", "PICKUP"),
          log("pickup-2", "PICKUP"),
        ]}
        selectedKey={null}
        onSelectLog={vi.fn()}
        onSelectBatch={onSelectBatch}
        onRetry={vi.fn()}
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

  it("shows a dedicated failure card and retries instead of rendering the empty state", () => {
    const onRetry = vi.fn();

    render(
      <MobileHistoryList
        loading={false}
        error="transactions unavailable"
        filteredLogs={[]}
        selectedKey={null}
        onSelectLog={vi.fn()}
        onSelectBatch={vi.fn()}
        onRetry={onRetry}
        canLoadMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("transactions unavailable");
    expect(screen.queryByText("표시할 데이터가 없습니다.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("keeps existing rows visible when an initial-page error coexists with cached data", () => {
    render(
      <MobileHistoryList
        loading={false}
        error="background refresh failed"
        filteredLogs={[log("cached", "PREPARE")]}
        selectedKey={null}
        onSelectLog={vi.fn()}
        onSelectBatch={vi.fn()}
        onRetry={vi.fn()}
        canLoadMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
      />,
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Shipping item cached")).toBeInTheDocument();
  });
});
