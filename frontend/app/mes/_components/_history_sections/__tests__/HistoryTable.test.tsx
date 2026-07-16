import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TransactionLog } from "@/lib/api";
import type { IoBatch } from "@/lib/api/types/io";
import { HistoryTable } from "../HistoryTable";
import type { LogGroup } from "../historyTableHelpers";

function makeLog(overrides: Partial<TransactionLog> = {}): TransactionLog {
  return {
    log_id: "log-1", item_id: "ITEM-1", mes_code: "3-AA-0005", item_name: "대표 품목", item_process_type_code: "AA", item_unit: "EA",
    transaction_type: "PRODUCE", quantity_change: 1, quantity_before: 0, quantity_after: 1, warehouse_qty_before: null, warehouse_qty_after: null,
    transfer_qty: 1, reference_no: "reference-1", produced_by: "요청자", requester_name: "요청자", approver_name: null, requested_at: "2026-07-15T00:00:00Z",
    approved_at: null, department: "조립", notes: null, operation_batch_id: null, created_at: "2026-07-15T00:00:00Z", edit_count: 0,
    cancelled: false, cancel_reason: null, cancelled_by: null, cancelled_at: null, inventory_effect: null, ...overrides,
  };
}

function makeBatch(): IoBatch {
  return {
    batch_id: "batch-1", work_type: "process", sub_type: "produce", status: "completed", requester_employee_id: "E001", requester_name: "요청자",
    requester_department: "조립", approver_employee_id: null, approver_name: null, from_department: null, to_department: "조립", requires_approval: false,
    stock_request_id: null, reference_no: null, notes: null, created_at: "2026-07-15T00:00:00Z", updated_at: "2026-07-15T00:00:00Z",
    submitted_at: "2026-07-15T00:00:00Z", completed_at: "2026-07-15T00:00:00Z",
    bundles: [{
      bundle_id: "bundle-1", source_kind: "bom_parent", title: "대표 품목", source_item_id: "ITEM-1", source_mes_code: "3-AA-0005", quantity: 1, expanded_level: 1,
      lines: [
        { line_id: "parent", item_id: "ITEM-1", item_name: "대표 품목", mes_code: "3-AA-0005", unit: "EA", direction: "in", from_bucket: "none", from_department: null, to_bucket: "production", to_department: "조립", quantity: 1, bom_expected: null, included: true, origin: "direct", edited: false, has_children: true, shortage: 0, exclusion_note: null },
        { line_id: "child", item_id: "COMP-1", item_name: "BOM 구성품", mes_code: "3-AR-0001", unit: "EA", direction: "out", from_bucket: "production", from_department: "조립", to_bucket: "none", to_department: null, quantity: 1, bom_expected: 1, included: true, origin: "bom_auto", edited: false, has_children: false, shortage: 0, exclusion_note: null },
      ],
    }],
  };
}

function renderTable(groups: LogGroup[], batchCache = new Map<string, IoBatch>(), collapseRequestNonce = 0) {
  return render(
    <HistoryTable loading={false} displayGroups={groups} selection={null} onSelectLog={vi.fn()} onSelectBatch={vi.fn()} batchCache={batchCache} setBatchCache={vi.fn()} canLoadMore={false} loadingMore={false} onLoadMore={vi.fn()} collapseRequestNonce={collapseRequestNonce} />,
  );
}

describe("HistoryTable hierarchy", () => {
  it("shows BOM sections before their item rows", () => {
    const parent = makeLog({ operation_batch_id: "batch-1" });
    renderTable([{ type: "op_batch", batchId: "batch-1", refNo: null, logs: [parent] }], new Map([["batch-1", makeBatch()]]));

    fireEvent.click(screen.getByRole("button", { name: "묶음 펼치기" }));
    expect(screen.getByText("BOM")).toBeInTheDocument();
    expect(screen.queryByText("BOM 구성품")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "BOM 구성 펼치기" }));
    expect(screen.getByText("BOM 구성품")).toBeInTheDocument();
  });

  it("keeps multi-item quantity adjustments behind one operation batch row", () => {
    const first = makeLog({
      log_id: "adjust-a",
      item_name: "보정 품목 A",
      transaction_type: "ADJUST",
      operation_batch_id: "batch-adjust",
    });
    const second = makeLog({
      log_id: "adjust-b",
      item_id: "ITEM-2",
      item_name: "보정 품목 B",
      transaction_type: "ADJUST",
      operation_batch_id: "batch-adjust",
    });
    const batch = { ...makeBatch(), batch_id: "batch-adjust", sub_type: "adjust_in", bundles: [] };

    renderTable(
      [{ type: "op_batch", batchId: "batch-adjust", refNo: null, logs: [first, second] }],
      new Map([["batch-adjust", batch]]),
    );

    expect(screen.queryByText("보정 품목 B")).not.toBeInTheDocument();
    expect(document.querySelectorAll("[data-history-main-row='true']")).toHaveLength(1);
    const toggle = screen.getByRole("button", { name: "묶음 펼치기" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps multi-item shipment rows behind their section", () => {
    const first = makeLog({ log_id: "ship-a", item_name: "출하 품목 A", transaction_type: "SHIP", shipping_phase: "PICKUP" });
    const second = makeLog({ log_id: "ship-b", item_id: "ITEM-2", item_name: "출하 품목 B", transaction_type: "SHIP", shipping_phase: "PICKUP" });
    renderTable([{ type: "batch", refKey: "shipment", refNo: "shipment", logs: [first, second] }]);

    fireEvent.click(screen.getByRole("button", { name: "묶음 펼치기" }));
    expect(screen.getAllByText("출하 품목 A")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "출하 구성 펼치기" }));
    expect(screen.getAllByText("출하 품목 A")).toHaveLength(2);
    expect(screen.getByText("출하 품목 B")).toBeInTheDocument();
  });

  it("keeps multi-item rework rows behind their result section", () => {
    const parent = makeLog({ log_id: "disassemble", transaction_type: "DISASSEMBLE", reference_no: "defect-disassemble:1" });
    const first = makeLog({ log_id: "scrap-a", item_id: "SCRAP-A", item_name: "폐기 품목 A", transaction_type: "DEFECT_SCRAP", reference_no: parent.reference_no });
    const second = makeLog({ log_id: "scrap-b", item_id: "SCRAP-B", item_name: "폐기 품목 B", transaction_type: "DEFECT_SCRAP", reference_no: parent.reference_no });
    renderTable([{ type: "batch", refKey: "rework", refNo: parent.reference_no!, logs: [parent, first, second] }]);

    fireEvent.click(screen.getByRole("button", { name: "묶음 펼치기" }));
    expect(screen.getByText("폐기 결과")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "처리결과 구성 펼치기" }));
    expect(screen.getByText("폐기 품목 A")).toBeInTheDocument();
    expect(screen.getByText("폐기 품목 B")).toBeInTheDocument();
  });

  it("collapses an open group when the detail panel requests a close", () => {
    const first = makeLog({ log_id: "ship-close-a", item_name: "Shipment A", transaction_type: "SHIP", shipping_phase: "PICKUP" });
    const second = makeLog({ log_id: "ship-close-b", item_id: "ITEM-2", item_name: "Shipment B", transaction_type: "SHIP", shipping_phase: "PICKUP" });
    const groups: LogGroup[] = [{ type: "batch", refKey: "shipment-close", refNo: "shipment-close", logs: [first, second] }];
    const view = renderTable(groups);
    const toggle = screen.getAllByRole("button").find((button) => button.hasAttribute("aria-expanded"));

    expect(toggle).toBeDefined();
    fireEvent.click(toggle!);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    view.rerender(
      <HistoryTable loading={false} displayGroups={groups} selection={null} onSelectLog={vi.fn()} onSelectBatch={vi.fn()} batchCache={new Map()} setBatchCache={vi.fn()} canLoadMore={false} loadingMore={false} onLoadMore={vi.fn()} collapseRequestNonce={1} />,
    );

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Shipment B")).not.toBeInTheDocument();
  });
});
