import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionLog } from "@/lib/api";
import type { IoBatch } from "@/lib/api/types/io";
import { DesktopHistoryRightPanel } from "../DesktopHistoryRightPanel";

const detailLifecycle = vi.hoisted(() => ({
  batchMounted: vi.fn(),
  batchUnmounted: vi.fn(),
  logMounted: vi.fn(),
  logUnmounted: vi.fn(),
}));

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
    <div data-testid="desktop-history-right-panel">
      <h2 id={titleId}>{title}</h2>
      {children}
    </div>
  ),
}));

vi.mock("../HistoryDetailPanel", async () => {
  const { useEffect } = await import("react");
  return {
    HistoryDetailPanel: ({ selected, allowCancellation }: any) => {
      useEffect(() => {
        detailLifecycle.logMounted();
        return () => detailLifecycle.logUnmounted();
      }, []);
      return (
        <div data-testid="history-detail-panel" data-allow-cancellation={allowCancellation === false ? "false" : "true"}>
          {selected.item_name}
        </div>
      );
    },
  };
});

vi.mock("../HistoryBatchDetailPanel", async () => {
  const { useEffect } = await import("react");
  return {
    HistoryBatchDetailPanel: ({ logs }: any) => {
      useEffect(() => {
        detailLifecycle.batchMounted();
        return () => detailLifecycle.batchUnmounted();
      }, []);
      return <div data-testid="history-batch-detail-panel">{logs[0].item_name}</div>;
    },
  };
});

function makeLog(overrides: Partial<TransactionLog> = {}): TransactionLog {
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
    ...overrides,
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

function panel(selection: any, batchCache = new Map<string, IoBatch>()) {
  return (
    <DesktopHistoryRightPanel
      selection={selection}
      displaySelection={selection}
      batchCache={batchCache}
      setBatchCache={() => {}}
      onSelectLog={() => {}}
      canGoBack={false}
      onBack={() => {}}
      onLogUpdated={() => {}}
      onBatchCancelled={() => {}}
      onFocusLineInList={() => {}}
      onClose={() => {}}
    />
  );
}

describe("DesktopHistoryRightPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses a non-modal complementary panel labelled by the stable title id", () => {
    const selection = { kind: "log" as const, log: makeLog() };
    render(panel(selection));

    const slidePanel = screen.getByTestId("desktop-history-slide-panel");
    const title = screen.getByRole("heading", { name: "부품 A" });
    expect(slidePanel).toHaveAttribute("data-modal", "false");
    expect(title.id).not.toBe("");
    expect(slidePanel).toHaveAttribute("data-labelled-by", title.id);
  });

  it("hides cancellation for a detail opened from a grouped child row", () => {
    const selection = {
      kind: "log" as const,
      log: makeLog(),
      allowCancellation: false,
    };
    render(panel(selection));

    expect(screen.getByTestId("history-detail-panel")).toHaveAttribute("data-allow-cancellation", "false");
    expect(screen.getByTestId("history-detail-panel")).toHaveTextContent("부품 A");
  });

  it("uses the merged manual bundle count in the detail title", () => {
    const log = makeLog({ operation_batch_id: "batch-1" });
    const selection = { kind: "batch" as const, batchId: "batch-1", logs: [log] };
    render(panel(selection, new Map([["batch-1", makeDuplicateManualBatch()]])));

    expect(screen.getByRole("heading", { name: "알루미늄 필터" })).toBeInTheDocument();
    expect(screen.queryByText(/알루미늄 필터.*1/)).not.toBeInTheDocument();
  });

  it("keeps the desktop detail card and single-log detail mounted while selecting another log", () => {
    const firstSelection = { kind: "log" as const, log: makeLog({ item_name: "Single A" }) };
    const { rerender } = render(panel(firstSelection));

    const slidePanelBefore = screen.getByTestId("desktop-history-slide-panel");
    const cardBefore = screen.getByTestId("desktop-history-right-panel");
    const secondSelection = { kind: "log" as const, log: makeLog({ log_id: "log-2", item_name: "Single B" }) };
    rerender(panel(secondSelection));

    expect(screen.getByTestId("desktop-history-slide-panel")).toBe(slidePanelBefore);
    expect(screen.getByTestId("desktop-history-right-panel")).toBe(cardBefore);
    expect(screen.getByRole("heading", { name: "Single B" })).toBeInTheDocument();
    expect(detailLifecycle.logMounted).toHaveBeenCalledTimes(1);
    expect(detailLifecycle.logUnmounted).not.toHaveBeenCalled();
  });

  it("keeps the desktop detail card and batch detail mounted while selecting another batch", () => {
    const firstSelection = {
      kind: "batch" as const,
      batchId: "batch-1",
      logs: [makeLog({ item_name: "Batch A", operation_batch_id: "batch-1" })],
    };
    const { rerender } = render(panel(firstSelection));

    const slidePanelBefore = screen.getByTestId("desktop-history-slide-panel");
    const cardBefore = screen.getByTestId("desktop-history-right-panel");
    const secondSelection = {
      kind: "batch" as const,
      batchId: "batch-2",
      logs: [makeLog({ log_id: "log-2", item_name: "Batch B", operation_batch_id: "batch-2" })],
    };
    rerender(panel(secondSelection));

    expect(screen.getByTestId("desktop-history-slide-panel")).toBe(slidePanelBefore);
    expect(screen.getByTestId("desktop-history-right-panel")).toBe(cardBefore);
    expect(screen.getByRole("heading")).toHaveTextContent("Batch B");
    expect(detailLifecycle.batchMounted).toHaveBeenCalledTimes(1);
    expect(detailLifecycle.batchUnmounted).not.toHaveBeenCalled();
  });
});
