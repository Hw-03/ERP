import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TransactionLog } from "@/lib/api";
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
});
