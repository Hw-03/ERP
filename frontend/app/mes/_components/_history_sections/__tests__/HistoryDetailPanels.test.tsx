import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, type TransactionLog } from "@/lib/api";
import { productionApi } from "@/lib/api/production";
import type { IoBatch } from "@/lib/api/types/io";
import { HistoryDetailMemo, HistoryDetailPanel } from "../HistoryDetailPanel";
import { HistoryBatchDetailPanel } from "../HistoryBatchDetailPanel";

vi.mock("@/lib/api", () => ({
  api: {
    getTransactionEdits: vi.fn(() => new Promise(() => {})),
    cancelTransaction: vi.fn(),
  },
}));

vi.mock("@/lib/api/io", () => ({
  ioApi: {
    getBatch: vi.fn(),
  },
}));

vi.mock("@/lib/api/production", () => ({
  productionApi: {
    getTransactions: vi.fn(),
  },
}));

vi.mock("../../login/useCurrentOperator", () => ({
  useCurrentOperator: () => ({ employee_code: "E001", name: "요청자 A" }),
}));

vi.mock("@/lib/ui/TruncatedText", () => ({
  TruncatedText: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="composition-truncated-text">{children}</span>
  ),
}));

function makeLog(overrides: Partial<TransactionLog> = {}): TransactionLog {
  return {
    log_id: "output",
    item_id: "item-finished",
    mes_code: "PF-001",
    item_name: "완제품 A",
    item_process_type_code: "PF",
    item_unit: "EA",
    transaction_type: "PRODUCE",
    quantity_change: 2,
    quantity_before: 309,
    quantity_after: 401,
    warehouse_qty_before: 401,
    warehouse_qty_after: 401,
    transfer_qty: null,
    reference_no: null,
    produced_by: "요청자 A",
    requester_name: "요청자 A",
    approver_name: null,
    requested_at: "2026-07-10T01:00:00Z",
    approved_at: null,
    department: "조립",
    notes: null,
    operation_batch_id: null,
    created_at: "2026-07-10T01:05:00Z",
    edit_count: 0,
    cancelled: false,
    cancel_reason: null,
    cancelled_by: null,
    cancelled_at: null,
    inventory_effect: [
      { scope: "warehouse", delta: 0 },
      { scope: "location", department: "조립", status: "PRODUCTION", delta: 2 },
    ],
    ...overrides,
  };
}

function makeBatch(overrides: Partial<IoBatch> = {}): IoBatch {
  return {
    batch_id: "batch-1",
    work_type: "process",
    sub_type: "produce",
    status: "completed",
    requester_employee_id: "employee-1",
    requester_name: "요청자 A",
    requester_department: "조립",
    approver_employee_id: null,
    approver_name: null,
    from_department: "조립",
    to_department: "조립",
    requires_approval: false,
    stock_request_id: null,
    reference_no: null,
    notes: null,
    created_at: "2026-07-10T01:00:00Z",
    updated_at: "2026-07-10T01:05:00Z",
    submitted_at: "2026-07-10T01:00:00Z",
    completed_at: "2026-07-10T01:05:00Z",
    bundles: [
      {
        bundle_id: "bundle-1",
        source_kind: "bom_parent",
        title: "완제품 A",
        source_item_id: "item-finished",
        source_mes_code: "PF-001",
        quantity: 2,
        expanded_level: 1,
        lines: [
          {
            line_id: "line-parent",
            item_id: "item-finished",
            item_name: "완제품 A",
            mes_code: "PF-001",
            unit: "EA",
            direction: "in",
            from_bucket: "none",
            from_department: "조립",
            to_bucket: "production",
            to_department: "조립",
            quantity: 2,
            bom_expected: null,
            included: true,
            origin: "direct",
            edited: false,
            has_children: true,
            shortage: 0,
            exclusion_note: null,
          },
          {
            line_id: "line-component",
            item_id: "component-only",
            item_name: "구성 검산 라인",
            mes_code: "R-999",
            unit: "EA",
            direction: "out",
            from_bucket: "production",
            from_department: "조립",
            to_bucket: "none",
            to_department: "조립",
            quantity: 4,
            bom_expected: 4,
            included: true,
            origin: "bom_auto",
            edited: false,
            has_children: false,
            shortage: 0,
            exclusion_note: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(productionApi.getTransactions).mockResolvedValue([]);
});

describe("desktop history detail panels", () => {
  it("summarizes excluded batch lines without listing their item names", () => {
    vi.mocked(productionApi.getTransactions).mockReturnValue(new Promise(() => {}));
    const batch = makeBatch();
    batch.bundles[0].lines[1] = {
      ...batch.bundles[0].lines[1],
      item_name: "제외된 구성품",
      included: false,
    };

    render(
      <HistoryBatchDetailPanel
        panelOpen
        batchId={batch.batch_id}
        logs={[makeLog({ operation_batch_id: batch.batch_id })]}
        batchCache={new Map([[batch.batch_id, batch]])}
        setBatchCache={() => {}}
        onBatchCancelled={() => {}}
        variant="desktop"
      />,
    );

    expect(screen.getByText("제외 1개")).toBeInTheDocument();
    expect(screen.queryByText("제외된 구성품")).not.toBeInTheDocument();
  });

  it("does not render a memo card for a rework child system note", () => {
    const { container } = render(<HistoryDetailMemo notes="[rework:scrap_child]" />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("[rework:scrap_child]")).not.toBeInTheDocument();
  });

  it("uses one key-point summary for a single log and puts cancel at the bottom", () => {
    render(
      <HistoryDetailPanel
        panelOpen
        selected={makeLog()}
        onSelectLog={() => {}}
        onLogUpdated={() => {}}
        variant="desktop"
      />,
    );

    expect(screen.getByTestId("history-key-point-summary")).toBeInTheDocument();
    expect(screen.getByText("조립 생산")).toBeInTheDocument();
    expect(screen.getByText("+2 EA")).toBeInTheDocument();
    expect(screen.queryByText(/처리 전|처리 후|창고 401/)).not.toBeInTheDocument();
    expect(screen.getByText("완제품 A")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이 내역 취소" })).toBeInTheDocument();
  });

  it("does not expose cancellation from a grouped child detail", () => {
    render(
      <HistoryDetailPanel
        panelOpen
        selected={makeLog()}
        allowCancellation={false}
        onSelectLog={() => {}}
        onLogUpdated={() => {}}
        variant="desktop"
      />,
    );

    expect(screen.queryByRole("button", { name: "이 내역 취소" })).not.toBeInTheDocument();
  });

  it("shows the whole-group CTA for a backend reference cancellation group", async () => {
    const selected = makeLog({
      operation_batch_id: null,
      reference_no: "defect-disassemble:rework-1",
    });
    vi.mocked(productionApi.getTransactions).mockResolvedValue([selected]);
    render(
      <HistoryDetailPanel
        panelOpen
        selected={selected}
        onSelectLog={() => {}}
        onLogUpdated={() => {}}
        variant="desktop"
      />,
    );

    expect(await screen.findByRole("button", { name: "이 내역 취소" })).toBeInTheDocument();
  });

  it("uses the complete reference scope for a single-log desktop actual impact", async () => {
    const selected = makeLog({
      log_id: "conversion-output",
      reference_no: "conversion-1",
      operation_batch_id: null,
      quantity_change: 1,
    });
    const component = makeLog({
      log_id: "conversion-component",
      reference_no: "conversion-1",
      operation_batch_id: null,
      item_id: "conversion-component",
      item_name: "scope-component",
      quantity_change: -2,
      inventory_effect: [{ scope: "location", department: "조립", status: "PRODUCTION", delta: -2 }],
    });
    vi.mocked(productionApi.getTransactions).mockResolvedValue([selected, component]);

    render(
      <HistoryDetailPanel
        panelOpen
        selected={selected}
        onSelectLog={() => {}}
        onLogUpdated={() => {}}
        variant="desktop"
      />,
    );

    expect(await screen.findByText("scope-component")).toBeInTheDocument();
    expect(screen.getByText("-2 EA")).toBeInTheDocument();
  });

  it("shows the cancellation target count and inventory effects only after confirmation opens", () => {
    render(
      <HistoryDetailPanel
        panelOpen
        selected={makeLog()}
        onSelectLog={() => {}}
        onLogUpdated={() => {}}
        variant="desktop"
      />,
    );

    expect(screen.queryByText("대상 1건")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이 내역 취소" }));
    expect(screen.getByText("대상 1건")).toBeInTheDocument();
    expect(screen.getAllByText("조립 생산")).toHaveLength(2);
  });

  it("uses the shared summary without a duplicate desktop composition card", async () => {
    const output = makeLog({ operation_batch_id: "batch-1" });
    const component = makeLog({
      log_id: "component",
      item_id: "component-a",
      item_name: "부품 A",
      mes_code: "R-001",
      transaction_type: "BACKFLUSH",
      quantity_change: -4,
      operation_batch_id: "batch-1",
      inventory_effect: [
        { scope: "location", department: "조립", status: "PRODUCTION", delta: -4 },
      ],
    });
    const batch = makeBatch();
    batch.bundles[0].lines[1].item_id = "component-a";
    const onFocusLineInList = vi.fn();
    vi.mocked(productionApi.getTransactions).mockResolvedValue([output, component]);
    render(
      <HistoryBatchDetailPanel
        panelOpen
        batchId="batch-1"
        logs={[output, component]}
        batchCache={new Map([["batch-1", batch]])}
        setBatchCache={() => {}}
        onBatchCancelled={() => {}}
        onFocusLineInList={onFocusLineInList}
        variant="desktop"
      />,
    );

    expect(screen.getByTestId("history-key-point-summary")).toBeInTheDocument();
    expect(await screen.findByText("완제품")).toBeInTheDocument();
    expect(screen.getByText("구성 검산 라인")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /구성 검산 라인/ }));
    expect(onFocusLineInList).toHaveBeenCalledWith({ groupKey: "batch-1", itemId: "component-a" });

    const cancel = await screen.findByRole("button", { name: "이 내역 취소" });
    expect(screen.getByTestId("history-key-point-summary").compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("loads the complete operation batch before exposing cancellation effects", async () => {
    const visible = makeLog({ operation_batch_id: "batch-1" });
    const hidden = makeLog({
      log_id: "hidden-component",
      item_id: "hidden-component-item",
      item_name: "hidden-component",
      mes_code: "R-777",
      transaction_type: "BACKFLUSH",
      quantity_change: -7,
      operation_batch_id: "batch-1",
      inventory_effect: [
        { scope: "location", department: "assembly", status: "PRODUCTION", delta: -7 },
      ],
    });
    let resolveScope: (logs: TransactionLog[]) => void = () => {};
    vi.mocked(productionApi.getTransactions).mockImplementationOnce(
      () => new Promise<TransactionLog[]>((resolve) => {
        resolveScope = resolve;
      }),
    );

    render(
      <HistoryBatchDetailPanel
        panelOpen
        batchId="batch-1"
        logs={[visible]}
        batchCache={new Map([["batch-1", makeBatch()]])}
        setBatchCache={() => {}}
        onBatchCancelled={() => {}}
        variant="desktop"
      />,
    );

    expect(productionApi.getTransactions).toHaveBeenCalledWith(
      { operationBatchId: "batch-1", limit: 2000, skip: 0 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByText("실제 영향 불러오는 중")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이 내역 취소" })).not.toBeInTheDocument();
    expect(screen.getByText("취소 범위 확인 중...")).toBeInTheDocument();

    await act(async () => resolveScope([visible, hidden]));
    expect(await screen.findByText("hidden-component")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "이 내역 취소" }));

    expect(screen.getAllByText("hidden-component")).toHaveLength(2);
  });

  it("blocks cancellation after a scope load failure and retries the whole group", async () => {
    const visible = makeLog({ operation_batch_id: "batch-1" });
    vi.mocked(productionApi.getTransactions)
      .mockRejectedValueOnce(new Error("scope failed"))
      .mockResolvedValueOnce([visible]);

    render(
      <HistoryBatchDetailPanel
        panelOpen
        batchId="batch-1"
        logs={[visible]}
        batchCache={new Map([["batch-1", makeBatch()]])}
        setBatchCache={() => {}}
        onBatchCancelled={() => {}}
        variant="desktop"
      />,
    );

    const retry = await screen.findByRole("button", { name: "취소 범위 다시 불러오기" });
    expect(screen.queryByRole("button", { name: "이 내역 취소" })).not.toBeInTheDocument();
    fireEvent.click(retry);

    expect(await screen.findByRole("button", { name: "이 내역 취소" })).toBeInTheDocument();
    expect(productionApi.getTransactions).toHaveBeenCalledTimes(2);
  });

  it("uses every same-reference sibling for a single defect-disassemble cancellation", async () => {
    const selected = makeLog({
      operation_batch_id: null,
      reference_no: "defect-disassemble:rework-1",
      shipping_phase: "parent",
    });
    const sibling = makeLog({
      log_id: "reference-sibling",
      item_id: "reference-sibling-item",
      item_name: "reference-sibling",
      operation_batch_id: null,
      reference_no: selected.reference_no,
      shipping_phase: "component",
      inventory_effect: [
        { scope: "location", department: "assembly", status: "PRODUCTION", delta: -3 },
      ],
    });
    vi.mocked(productionApi.getTransactions).mockResolvedValue([selected, sibling]);

    render(
      <HistoryDetailPanel
        panelOpen
        selected={selected}
        onSelectLog={() => {}}
        onLogUpdated={() => {}}
        variant="desktop"
      />,
    );

    expect(productionApi.getTransactions).toHaveBeenCalledWith(
      { referenceNo: selected.reference_no, limit: 2000, skip: 0 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "이 내역 취소" }));
    expect(screen.getAllByText("reference-sibling")).toHaveLength(2);
  });

  it("hides single cancellation when the fresh full scope is already cancelled", async () => {
    const staleSelected = makeLog({
      operation_batch_id: null,
      reference_no: "defect-disassemble:already-cancelled",
      cancelled: false,
    });
    const freshCancelled = makeLog({
      ...staleSelected,
      cancelled: true,
      cancel_reason: "already cancelled elsewhere",
    });
    vi.mocked(productionApi.getTransactions).mockResolvedValue([freshCancelled]);

    render(
      <HistoryDetailPanel
        panelOpen
        selected={staleSelected}
        onSelectLog={() => {}}
        onLogUpdated={() => {}}
        variant="desktop"
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText("취소 범위 확인 중...")).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "이 내역 취소" })).not.toBeInTheDocument();
    expect(api.cancelTransaction).not.toHaveBeenCalled();
  });

  it("hides batch cancellation when the fresh exact scope is already cancelled", async () => {
    const staleVisible = makeLog({
      operation_batch_id: "batch-1",
      cancelled: false,
    });
    const freshCancelled = makeLog({
      ...staleVisible,
      cancelled: true,
      cancel_reason: "already cancelled elsewhere",
    });
    vi.mocked(productionApi.getTransactions).mockResolvedValue([freshCancelled]);

    render(
      <HistoryBatchDetailPanel
        panelOpen
        batchId="batch-1"
        logs={[staleVisible]}
        batchCache={new Map([["batch-1", makeBatch()]])}
        setBatchCache={() => {}}
        onBatchCancelled={() => {}}
        variant="desktop"
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText("취소 범위 확인 중...")).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "이 내역 취소" })).not.toBeInTheDocument();
    expect(api.cancelTransaction).not.toHaveBeenCalled();
  });

  it("immediately synchronizes a visible cancellation into the ready full scope", async () => {
    const visible = makeLog({ operation_batch_id: "batch-1", cancelled: false });
    const hidden = makeLog({
      log_id: "hidden-component",
      item_id: "hidden-component-item",
      item_name: "hidden-component",
      transaction_type: "BACKFLUSH",
      operation_batch_id: "batch-1",
      cancelled: false,
      inventory_effect: [
        { scope: "location", department: "assembly", status: "PRODUCTION", delta: -2 },
      ],
    });
    vi.mocked(productionApi.getTransactions).mockResolvedValue([visible, hidden]);
    const batchCache = new Map([["batch-1", makeBatch()]]);
    const { rerender } = render(
      <HistoryBatchDetailPanel
        panelOpen
        batchId="batch-1"
        logs={[visible]}
        batchCache={batchCache}
        setBatchCache={() => {}}
        onBatchCancelled={() => {}}
        variant="desktop"
      />,
    );

    expect(await screen.findByRole("button", { name: "이 내역 취소" })).toBeInTheDocument();
    const cancelledVisible = {
      ...visible,
      cancelled: true,
      cancel_reason: "cancelled successfully",
      cancelled_by: "employee-1",
      cancelled_at: "2026-07-10T02:00:00Z",
    };

    rerender(
      <HistoryBatchDetailPanel
        panelOpen
        batchId="batch-1"
        logs={[cancelledVisible]}
        batchCache={batchCache}
        setBatchCache={() => {}}
        onBatchCancelled={() => {}}
        variant="desktop"
      />,
    );

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "이 내역 취소" })).not.toBeInTheDocument();
      expect(screen.getByText("취소됨")).toBeInTheDocument();
    });
    expect(productionApi.getTransactions).toHaveBeenCalledTimes(1);
  });

  it("keeps the first log's single cancellation for a non-atomic reference display group", () => {
    const referenceNo = "display-reference-1";
    const first = makeLog({
      operation_batch_id: null,
      reference_no: referenceNo,
      cancelled: false,
    });
    const second = makeLog({
      log_id: "second",
      operation_batch_id: null,
      reference_no: referenceNo,
      cancelled: false,
    });

    render(
      <HistoryBatchDetailPanel
        panelOpen
        batchId={`${referenceNo}::`}
        logs={[first, second]}
        batchCache={new Map()}
        setBatchCache={() => {}}
        onBatchCancelled={() => {}}
        variant="desktop"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "이 내역 취소" }));
    expect(screen.getByText("대상 1건")).toBeInTheDocument();
    expect(productionApi.getTransactions).not.toHaveBeenCalled();
  });

  it("shows the mobile single-log cancellation count and actual effects after confirmation", () => {
    render(
      <HistoryDetailPanel
        panelOpen
        selected={makeLog()}
        onSelectLog={() => {}}
        onLogUpdated={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "이 내역 취소" }));
    expect(screen.getByText("대상 1건")).toBeInTheDocument();
    expect(screen.getByText("되돌릴 실제 영향")).toBeInTheDocument();
  });

  it("uses the common CTA and confirmation details for a mobile batch", async () => {
    const output = makeLog({ operation_batch_id: "batch-1" });
    vi.mocked(productionApi.getTransactions).mockResolvedValue([output]);
    render(
      <HistoryBatchDetailPanel
        panelOpen
        batchId="batch-1"
        logs={[output]}
        batchCache={new Map([["batch-1", makeBatch()]])}
        setBatchCache={() => {}}
        onBatchCancelled={() => {}}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "이 내역 취소" }));
    expect(screen.getByText("대상 1건")).toBeInTheDocument();
    expect(screen.getByText("되돌릴 실제 영향")).toBeInTheDocument();
  });

  it("does not let a late batch cancellation response overwrite a newly selected batch", async () => {
    let resolveFirst: (updated: TransactionLog) => void = () => {};
    vi.mocked(api.cancelTransaction).mockImplementationOnce(
      () => new Promise<TransactionLog>((resolve) => {
        resolveFirst = resolve;
      }),
    );
    const firstLog = makeLog({ operation_batch_id: "batch-1" });
    const secondLog = makeLog({
      log_id: "second-output",
      operation_batch_id: "batch-2",
      item_name: "완제품 B",
    });
    const firstBatch = makeBatch();
    const secondBatch = makeBatch({ batch_id: "batch-2", status: "completed" });
    vi.mocked(productionApi.getTransactions).mockImplementation(({ operationBatchId }) =>
      Promise.resolve(operationBatchId === "batch-1" ? [firstLog] : [secondLog]),
    );
    const cache = new Map([
      ["batch-1", firstBatch],
      ["batch-2", secondBatch],
    ]);
    const { rerender } = render(
      <HistoryBatchDetailPanel
        panelOpen
        batchId="batch-1"
        logs={[firstLog]}
        batchCache={cache}
        setBatchCache={() => {}}
        onBatchCancelled={() => {}}
        variant="desktop"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "이 내역 취소" }));
    fireEvent.change(screen.getByLabelText("취소 사유"), { target: { value: "이전 묶음" } });
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "취소 확정" }));

    rerender(
      <HistoryBatchDetailPanel
        panelOpen
        batchId="batch-2"
        logs={[secondLog]}
        batchCache={cache}
        setBatchCache={() => {}}
        onBatchCancelled={() => {}}
        variant="desktop"
      />,
    );
    await waitFor(() => expect(screen.getByText("완료")).toBeInTheDocument());

    await act(async () => {
      resolveFirst(makeLog({
        operation_batch_id: "batch-1",
        cancelled: true,
        cancel_reason: "이전 묶음",
      }));
    });

    expect(screen.getByText("완료")).toBeInTheDocument();
    expect(screen.queryByText("취소됨")).not.toBeInTheDocument();
  });
});
