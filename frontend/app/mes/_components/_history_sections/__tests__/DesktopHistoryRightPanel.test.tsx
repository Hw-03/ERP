import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TransactionLog } from "@/lib/api";
import type { IoBatch } from "@/lib/api/types/io";
import { DesktopHistoryRightPanel } from "../DesktopHistoryRightPanel";

vi.mock("../../common", () => ({
  SlidePanel: ({ modal, labelledBy, children }: any) => (
    <aside
      data-testid="desktop-history-slide-panel"
      data-modal={modal === false ? "false" : "unset"}
      data-labelled-by={labelledBy ?? ""}
    >
      {children}
    </aside>
  ),
}));

vi.mock("../../DesktopRightPanel", () => ({
  DesktopRightPanel: ({ title, titleId, children }: any) => (
    <div>
      <h2 id={titleId}>{title}</h2>
      {children}
    </div>
  ),
}));

vi.mock("../HistoryDetailPanel", () => ({
  HistoryDetailPanel: ({ allowCancellation }: any) => (
    <div data-testid="history-detail-panel" data-allow-cancellation={allowCancellation === false ? "false" : "true"}>
      단건 상세
    </div>
  ),
}));
vi.mock("../HistoryBatchDetailPanel", () => ({ HistoryBatchDetailPanel: () => <div>묶음 상세</div> }));

function makeLog(): TransactionLog {
  return {
    log_id: "log-1",
    item_id: "item-1",
    mes_code: "R-001",
    item_name: "부품 A",
    item_process_type_code: "R",
    item_unit: "EA",
    transaction_type: "BACKFLUSH",
    quantity_change: -1,
    quantity_before: 10,
    quantity_after: 9,
    warehouse_qty_before: 0,
    warehouse_qty_after: 0,
    transfer_qty: null,
    reference_no: null,
    produced_by: "요청자 A",
    requester_name: "요청자 A",
    approver_name: null,
    department: "조립",
    notes: null,
    operation_batch_id: null,
    created_at: "2026-07-10T01:00:00Z",
    cancelled: false,
    cancel_reason: null,
    cancelled_by: null,
    cancelled_at: null,
    inventory_effect: [],
  };
}

function makeDuplicateManualBatch(): IoBatch {
  const makeBundle = (bundleId: string, lineId: string) => ({
    bundle_id: bundleId,
    source_kind: "manual" as const,
    title: "알루미늄 필터",
    source_item_id: "item-1",
    source_mes_code: "R-001",
    quantity: 1,
    expanded_level: 1,
    lines: [{
      line_id: lineId,
      item_id: "item-1",
      item_name: "알루미늄 필터",
      mes_code: "R-001",
      unit: "EA",
      direction: "adjust" as const,
      from_bucket: "none" as const,
      from_department: null,
      to_bucket: "production" as const,
      to_department: "진공",
      quantity: 1,
      bom_expected: null,
      included: true,
      origin: "manual" as const,
      edited: false,
      has_children: false,
      shortage: 0,
      exclusion_note: null,
    }],
  });
  return {
    batch_id: "batch-1",
    work_type: "process",
    sub_type: "adjust_in",
    status: "completed",
    requester_employee_id: "employee-1",
    requester_name: "요청자 A",
    requester_department: "진공",
    approver_employee_id: "employee-1",
    approver_name: "요청자 A",
    from_department: null,
    to_department: "진공",
    requires_approval: false,
    stock_request_id: null,
    reference_no: null,
    notes: null,
    created_at: "2026-07-10T01:00:00Z",
    updated_at: "2026-07-10T01:00:00Z",
    submitted_at: "2026-07-10T01:00:00Z",
    completed_at: "2026-07-10T01:00:00Z",
    bundles: [makeBundle("bundle-1", "line-1"), makeBundle("bundle-2", "line-2")],
  };
}

describe("DesktopHistoryRightPanel", () => {
  it("uses a non-modal complementary panel labelled by the stable title id", () => {
    const selection = { kind: "log" as const, log: makeLog() };
    render(
      <DesktopHistoryRightPanel
        selection={selection}
        displaySelection={selection}
        batchCache={new Map()}
        setBatchCache={() => {}}
        onSelectLog={() => {}}
        canGoBack={false}
        onBack={() => {}}
        onLogUpdated={() => {}}
        onBatchCancelled={() => {}}
        onFocusLineInList={() => {}}
        onClose={() => {}}
      />,
    );

    const panel = screen.getByTestId("desktop-history-slide-panel");
    const title = screen.getByRole("heading", { name: "부품 A" });
    expect(panel).toHaveAttribute("data-modal", "false");
    expect(title.id).not.toBe("");
    expect(panel).toHaveAttribute("data-labelled-by", title.id);
  });

  it("hides cancellation for a detail opened from a grouped child row", () => {
    const selection = {
      kind: "log" as const,
      log: makeLog(),
      allowCancellation: false,
    } as any;
    render(
      <DesktopHistoryRightPanel
        selection={selection}
        displaySelection={selection}
        batchCache={new Map()}
        setBatchCache={() => {}}
        onSelectLog={() => {}}
        canGoBack={false}
        onBack={() => {}}
        onLogUpdated={() => {}}
        onBatchCancelled={() => {}}
        onFocusLineInList={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByTestId("history-detail-panel")).toHaveAttribute("data-allow-cancellation", "false");
  });

  it("uses the merged manual bundle count in the detail title", () => {
    const log = { ...makeLog(), operation_batch_id: "batch-1" };
    const selection = { kind: "batch" as const, batchId: "batch-1", logs: [log] };
    render(
      <DesktopHistoryRightPanel
        selection={selection}
        displaySelection={selection}
        batchCache={new Map([["batch-1", makeDuplicateManualBatch()]])}
        setBatchCache={() => {}}
        onSelectLog={() => {}}
        canGoBack={false}
        onBack={() => {}}
        onLogUpdated={() => {}}
        onBatchCancelled={() => {}}
        onFocusLineInList={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByRole("heading", { name: "알루미늄 필터" })).toBeInTheDocument();
    expect(screen.queryByText("알루미늄 필터 외 1건")).not.toBeInTheDocument();
  });
});
