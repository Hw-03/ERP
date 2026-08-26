import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { api, type TransactionEditLog, type TransactionLog } from "@/lib/api";
import { ioApi } from "@/lib/api/io";
import { productionApi } from "@/lib/api/production";
import type { IoBatch } from "@/lib/api/types/io";
import { HistoryDetailMemo, HistoryDetailPanel } from "../HistoryDetailPanel";
import { HistoryBatchDetailPanel } from "../HistoryBatchDetailPanel";

const realtimeState = vi.hoisted(() => ({
  revision: 1 as number | null,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

vi.mock("@/lib/queries/realtime", () => ({
  useRealtimeRevision: () => realtimeState.revision,
}));

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
  realtimeState.revision = 1;
  vi.mocked(productionApi.getTransactions).mockResolvedValue([]);
});

describe("desktop history detail panels", () => {
  it("모바일 상세는 묶음의 실행 로그를 사용해 단품 출고를 감소로 표시한다", async () => {
    const batch = makeBatch({
      sub_type: "disassemble",
      bundles: [{
        bundle_id: "shipment-bundle",
        source_kind: "manual",
        title: "단품 출고",
        source_item_id: "item-finished",
        source_mes_code: "PF-001",
        quantity: 1,
        expanded_level: 0,
        lines: [{
          ...makeBatch().bundles[0].lines[0],
          line_id: "shipment-line",
          direction: "adjust",
          from_bucket: "production",
          to_bucket: "none",
          quantity: 1,
          origin: "manual",
        }],
      }],
    });
    const selected = makeLog({
      operation_batch_id: batch.batch_id,
      operation_line_id: "shipment-line",
      transaction_type: "ADJUST",
      quantity_change: -1,
      quantity_before: 4,
      quantity_after: 3,
      inventory_effect: [{ scope: "location", department: "조립", status: "PRODUCTION", delta: -1 }],
    });
    vi.mocked(ioApi.getBatch).mockResolvedValue(batch);
    vi.mocked(productionApi.getTransactions).mockResolvedValue([selected]);

    render(
      <HistoryDetailPanel panelOpen selected={selected} onSelectLog={() => {}} onLogUpdated={() => {}} />,
    );

    expect(await screen.findByText("단품 출고 -1 EA")).toBeInTheDocument();
  });

  it("keeps loaded edit history visible while a realtime refresh is pending", async () => {
    const existingEdit = { edit_id: "existing", original_log_id: "same-log", edited_by_employee_id: "e1", edited_by_name: "Existing editor", reason: "existing", before_payload: "{}", after_payload: "{}", correction_log_id: null, created_at: "2026-08-04T00:00:00Z" };
    const refresh = deferred<TransactionEditLog[]>();
    vi.mocked(api.getTransactionEdits)
      .mockResolvedValueOnce([existingEdit])
      .mockReturnValueOnce(refresh.promise);
    const selected = makeLog({ log_id: "same-log", operation_batch_id: null, edit_count: undefined });
    const { rerender } = render(
      <HistoryDetailPanel panelOpen selected={selected} onSelectLog={() => {}} onLogUpdated={() => {}} variant="desktop" />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /\uC218\uC815 \uC774\uB825.*1/ }));
    expect(screen.getByText("Existing editor")).toBeInTheDocument();

    realtimeState.revision = 2;
    rerender(
      <HistoryDetailPanel panelOpen selected={selected} onSelectLog={() => {}} onLogUpdated={() => {}} variant="desktop" />,
    );

    await waitFor(() => expect(api.getTransactionEdits).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Existing editor")).toBeInTheDocument();
    await act(async () => refresh.resolve([existingEdit]));
  });

  it("re-fetches the selected log edits on a realtime revision and ignores the aborted response", async () => {
    let firstSignal: AbortSignal | undefined;
    let resolveFirst: (edits: TransactionEditLog[]) => void = () => {};
    let resolveSecond: (edits: TransactionEditLog[]) => void = () => {};
    const selected = makeLog({ log_id: "realtime-log", edit_count: undefined });
    vi.mocked(api.getTransactionEdits)
      .mockImplementationOnce((_logId, options) => new Promise<TransactionEditLog[]>((resolve) => {
        firstSignal = options?.signal;
        resolveFirst = resolve;
      }))
      .mockImplementationOnce(() => new Promise<TransactionEditLog[]>((resolve) => {
        resolveSecond = resolve;
      }));
    const { rerender } = render(
      <HistoryDetailPanel
        panelOpen
        selected={selected}
        onSelectLog={() => {}}
        onLogUpdated={() => {}}
        variant="desktop"
      />,
    );
    await waitFor(() => expect(api.getTransactionEdits).toHaveBeenCalledTimes(1));

    realtimeState.revision = 2;
    rerender(
      <HistoryDetailPanel
        panelOpen
        selected={selected}
        onSelectLog={() => {}}
        onLogUpdated={() => {}}
        variant="desktop"
      />,
    );

    await waitFor(() => expect(api.getTransactionEdits).toHaveBeenCalledTimes(2));
    expect(firstSignal?.aborted).toBe(true);
    await act(async () => {
      resolveSecond([{ edit_id: "fresh", original_log_id: "realtime-log", edited_by_employee_id: "e2", edited_by_name: "Fresh editor", reason: "fresh", before_payload: "{}", after_payload: "{}", correction_log_id: null, created_at: "2026-08-04T00:00:00Z" }]);
    });
    fireEvent.click(screen.getByRole("button", { name: /\uC218\uC815 \uC774\uB825.*1/ }));
    expect(await screen.findByText("Fresh editor")).toBeInTheDocument();

    await act(async () => {
      resolveFirst([{ edit_id: "stale", original_log_id: "realtime-log", edited_by_employee_id: "e1", edited_by_name: "Stale editor", reason: "stale", before_payload: "{}", after_payload: "{}", correction_log_id: null, created_at: "2026-08-04T00:00:00Z" }]);
    });
    expect(screen.queryByText("Stale editor")).not.toBeInTheDocument();
  });

  it("aborts a prior edit request and ignores its late response after the selected log changes", async () => {
    let firstSignal: AbortSignal | undefined;
    let resolveFirst: (edits: TransactionEditLog[]) => void = () => {};
    let resolveSecond: (edits: TransactionEditLog[]) => void = () => {};
    const firstEdit: TransactionEditLog = {
      edit_id: "edit-a",
      original_log_id: "log-a",
      edited_by_employee_id: "employee-a",
      edited_by_name: "First editor",
      reason: "first reason",
      before_payload: "{}",
      after_payload: "{}",
      correction_log_id: null,
      created_at: "2026-07-10T01:00:00Z",
    };
    const secondEdit: TransactionEditLog = {
      ...firstEdit,
      edit_id: "edit-b",
      original_log_id: "log-b",
      edited_by_name: "Second editor",
      reason: "second reason",
    };
    vi.mocked(api.getTransactionEdits)
      .mockImplementationOnce((_logId, options) => new Promise<TransactionEditLog[]>((resolve) => {
        firstSignal = options?.signal;
        resolveFirst = resolve;
      }))
      .mockImplementationOnce((_logId, _options) => new Promise<TransactionEditLog[]>((resolve) => {
        resolveSecond = resolve;
      }));
    const first = makeLog({ log_id: "log-a", edit_count: undefined });
    const second = makeLog({ log_id: "log-b", edit_count: undefined });
    const { rerender } = render(
      <HistoryDetailPanel
        panelOpen
        selected={first}
        onSelectLog={() => {}}
        onLogUpdated={() => {}}
        variant="desktop"
      />,
    );

    expect(firstSignal).toBeDefined();
    rerender(
      <HistoryDetailPanel
        panelOpen
        selected={second}
        onSelectLog={() => {}}
        onLogUpdated={() => {}}
        variant="desktop"
      />,
    );

    expect(firstSignal?.aborted).toBe(true);
    await act(async () => {
      resolveSecond([secondEdit]);
    });
    fireEvent.click(screen.getByRole("button", { name: /수정 이력.*1/ }));
    expect(await screen.findByText("Second editor")).toBeInTheDocument();

    await act(async () => {
      resolveFirst([firstEdit]);
    });
    expect(screen.getByText("Second editor")).toBeInTheDocument();
    expect(screen.queryByText("First editor")).not.toBeInTheDocument();
  });

  it("aborts a prior batch-flow request and ignores its late response after the selected log changes", async () => {
    let firstSignal: AbortSignal | undefined;
    let resolveFirst: (batch: IoBatch) => void = () => {};
    let resolveSecond: (batch: IoBatch) => void = () => {};
    const firstBatch = makeBatch({
      batch_id: "batch-a",
      from_department: "Flow A",
      to_department: "Flow A",
    });
    const secondBatch = makeBatch({
      batch_id: "batch-b",
      from_department: "Flow B",
      to_department: "Flow B",
    });
    vi.mocked(ioApi.getBatch)
      .mockImplementationOnce((_batchId, options) => new Promise<IoBatch>((resolve) => {
        firstSignal = options?.signal;
        resolveFirst = resolve;
      }))
      .mockImplementationOnce((_batchId, _options) => new Promise<IoBatch>((resolve) => {
        resolveSecond = resolve;
      }));
    const first = makeLog({ log_id: "log-a", operation_batch_id: "batch-a" });
    const second = makeLog({ log_id: "log-b", operation_batch_id: "batch-b" });
    const { rerender } = render(
      <HistoryDetailPanel
        panelOpen
        selected={first}
        onSelectLog={() => {}}
        onLogUpdated={() => {}}
      />,
    );

    expect(firstSignal).toBeDefined();
    rerender(
      <HistoryDetailPanel
        panelOpen
        selected={second}
        onSelectLog={() => {}}
        onLogUpdated={() => {}}
      />,
    );

    expect(firstSignal?.aborted).toBe(true);
    await act(async () => {
      resolveSecond(secondBatch);
    });
    expect(await screen.findByText("Flow B")).toBeInTheDocument();

    await act(async () => {
      resolveFirst(firstBatch);
    });
    expect(screen.getByText("Flow B")).toBeInTheDocument();
    expect(screen.queryByText("Flow A")).not.toBeInTheDocument();
  });

  it("re-fetches the selected log batch flow on a realtime revision", async () => {
    let staleSignal: AbortSignal | undefined;
    let resolveStale: (batch: IoBatch) => void = () => {};
    let resolveFresh: (batch: IoBatch) => void = () => {};
    vi.mocked(ioApi.getBatch)
      .mockImplementationOnce((_batchId, options) => new Promise<IoBatch>((resolve) => {
        staleSignal = options?.signal;
        resolveStale = resolve;
      }))
      .mockImplementationOnce(() => new Promise<IoBatch>((resolve) => {
        resolveFresh = resolve;
      }));
    const selected = makeLog({ log_id: "same-log", operation_batch_id: "same-batch" });
    const { rerender } = render(
      <HistoryDetailPanel
        panelOpen
        selected={selected}
        onSelectLog={() => {}}
        onLogUpdated={() => {}}
      />,
    );
    await waitFor(() => expect(ioApi.getBatch).toHaveBeenCalledTimes(1));

    realtimeState.revision = 2;
    rerender(
      <HistoryDetailPanel
        panelOpen
        selected={selected}
        onSelectLog={() => {}}
        onLogUpdated={() => {}}
      />,
    );

    await waitFor(() => expect(ioApi.getBatch).toHaveBeenCalledTimes(2));
    expect(staleSignal?.aborted).toBe(true);
    await act(async () => resolveFresh(makeBatch({ batch_id: "same-batch", from_department: "Fresh Flow", to_department: "Fresh Flow" })));
    expect(await screen.findByText("Fresh Flow")).toBeInTheDocument();

    await act(async () => resolveStale(makeBatch({ batch_id: "same-batch", from_department: "Stale Flow", to_department: "Stale Flow" })));
    expect(screen.queryByText("Stale Flow")).not.toBeInTheDocument();
  });

  it("refreshes an open batch detail and its shared cache on a realtime revision", async () => {
    let staleSignal: AbortSignal | undefined;
    let resolveStale: (batch: IoBatch) => void = () => {};
    let resolveFresh: (batch: IoBatch) => void = () => {};
    vi.mocked(ioApi.getBatch)
      .mockImplementationOnce((_batchId, options) => new Promise<IoBatch>((resolve) => {
        staleSignal = options?.signal;
        resolveStale = resolve;
      }))
      .mockImplementationOnce(() => new Promise<IoBatch>((resolve) => {
        resolveFresh = resolve;
      }));
    const logs = [makeLog({ log_id: "batch-log", operation_batch_id: "same-batch" })];

    function BatchHarness() {
      const [cache, setCache] = useState<Map<string, IoBatch>>(new Map());
      return (
        <>
          <span data-testid="shared-batch-cache">{cache.get("same-batch")?.from_department ?? "empty"}</span>
          <HistoryBatchDetailPanel
            panelOpen
            batchId="same-batch"
            logs={logs}
            batchCache={cache}
            setBatchCache={setCache}
            onBatchCancelled={() => {}}
          />
        </>
      );
    }

    const { rerender } = render(<BatchHarness />);
    await waitFor(() => expect(ioApi.getBatch).toHaveBeenCalledTimes(1));

    realtimeState.revision = 2;
    rerender(<BatchHarness />);

    await waitFor(() => expect(ioApi.getBatch).toHaveBeenCalledTimes(2));
    expect(staleSignal?.aborted).toBe(true);
    await act(async () => resolveFresh(makeBatch({ batch_id: "same-batch", from_department: "Fresh Batch", to_department: "Fresh Batch" })));
    expect((await screen.findAllByText("Fresh Batch")).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId("shared-batch-cache")).toHaveTextContent("Fresh Batch");

    await act(async () => resolveStale(makeBatch({ batch_id: "same-batch", from_department: "Stale Batch", to_department: "Stale Batch" })));
    expect(screen.queryByText("Stale Batch")).not.toBeInTheDocument();
    expect(screen.getByTestId("shared-batch-cache")).toHaveTextContent("Fresh Batch");
  });

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

  it("shows internal-use mode and return effects without treating unchanged lines as exclusions", () => {
    vi.mocked(productionApi.getTransactions).mockReturnValue(new Promise(() => {}));
    const batch = makeBatch({
      work_type: "internal_use",
      sub_type: "internal_use_out",
      to_department: "연구",
    });
    const parent = {
      ...batch.bundles[0].lines[0],
      direction: "out" as const,
      from_bucket: "warehouse" as const,
      from_department: null,
      to_bucket: "none" as const,
      to_department: null,
      selected: true,
    };
    const returned = {
      ...batch.bundles[0].lines[1],
      line_id: "returned-line",
      item_id: "returned-item",
      item_name: "재입고 하위",
      direction: "in" as const,
      from_bucket: "none" as const,
      from_department: null,
      to_bucket: "production" as const,
      to_department: "가공",
      selected: false,
      included: true,
    };
    const unchanged = {
      ...batch.bundles[0].lines[1],
      line_id: "unchanged-line",
      item_id: "unchanged-item",
      item_name: "변동 없는 하위",
      selected: false,
      included: false,
    };
    batch.bundles[0] = {
      ...batch.bundles[0],
      internal_use_bom_mode: "parent_and_children",
      lines: [parent, returned, unchanged],
    };
    const logs = [
      makeLog({
        transaction_type: "INTERNAL_USE",
        operation_batch_id: batch.batch_id,
        item_id: parent.item_id,
      }),
      makeLog({
        log_id: "return-log",
        transaction_type: "PRODUCE",
        operation_batch_id: batch.batch_id,
        item_id: returned.item_id,
        item_name: returned.item_name,
        department: "가공",
      }),
    ];

    const { unmount } = render(
      <HistoryBatchDetailPanel
        panelOpen
        batchId={batch.batch_id}
        logs={logs}
        batchCache={new Map([[batch.batch_id, batch]])}
        setBatchCache={() => {}}
        onBatchCancelled={() => {}}
      />,
    );

    expect(screen.getByText("상·하위 차감")).toBeInTheDocument();
    expect(screen.getByText("재입고 하위")).toBeInTheDocument();
    expect(screen.getByText("변동 없는 하위")).toBeInTheDocument();
    expect(screen.getByText("소속 부서 재입고")).toBeInTheDocument();
    expect(screen.getByText("변동 없음")).toBeInTheDocument();
    expect(screen.queryByText("목록 외")).not.toBeInTheDocument();

    unmount();
    render(
      <HistoryBatchDetailPanel
        panelOpen
        batchId={batch.batch_id}
        logs={logs}
        batchCache={new Map([[batch.batch_id, batch]])}
        setBatchCache={() => {}}
        onBatchCancelled={() => {}}
        variant="desktop"
      />,
    );
    expect(screen.queryByText("제외 1개")).not.toBeInTheDocument();
  });

  it("does not render a memo card for a rework child system note", () => {
    const { container } = render(<HistoryDetailMemo notes="[rework:scrap_child]" />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("[rework:scrap_child]")).not.toBeInTheDocument();
  });

  it("shows the shipping prepare completer as the batch detail actor", () => {
    vi.mocked(productionApi.getTransactions).mockReturnValue(new Promise(() => {}));
    const shippingLog = makeLog({
      transaction_type: "SHIP",
      operation_batch_id: "batch-1",
      produced_by: "준비 완료자 B",
      requester_name: "요청자 A",
    });
    const batch = makeBatch({ requester_name: "요청자 A" });

    render(
      <HistoryBatchDetailPanel
        panelOpen
        batchId={batch.batch_id}
        logs={[shippingLog]}
        batchCache={new Map([[batch.batch_id, batch]])}
        setBatchCache={() => {}}
        onBatchCancelled={() => {}}
        variant="mobile"
      />,
    );

    const actorName = screen.getByText("준비 완료자 B");
    expect(actorName.parentElement).toHaveTextContent(/^담당자/);
    expect(screen.queryByText("요청자 A")).not.toBeInTheDocument();
  });

  it("keeps a companion-like user memo on a non-shipping transaction", () => {
    render(<HistoryDetailMemo notes="동반 출하: 현장 전달 사항" transactionType="RECEIVE" />);

    expect(screen.getByText("동반 출하: 현장 전달 사항")).toBeInTheDocument();
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
    expect(screen.getByText("조립 재고")).toBeInTheDocument();
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

  it("keeps an expanded shipping impact row's signed EA quantity in the desktop detail", async () => {
    const selected = makeLog({
      log_id: "shipping-visible",
      transaction_type: "SHIP",
      reference_no: "shipping-impact-1",
      operation_batch_id: null,
      item_id: "shipping-item-1",
      item_name: "Shipping item 1",
      quantity_change: -1,
      inventory_effect: [{ scope: "location", department: "출하", status: "PRODUCTION", delta: -1 }],
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

    expect(await screen.findByText("Shipping item 1")).toBeInTheDocument();
    expect(screen.getByText("-1 EA")).toBeInTheDocument();
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
    expect(screen.getAllByText("조립 재고")).toHaveLength(2);
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
    expect(screen.queryByRole("button", { name: /구성 검산 라인/ })).not.toBeInTheDocument();
    expect(onFocusLineInList).not.toHaveBeenCalled();

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
    expect(screen.getByText("재고 변화 불러오는 중")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이 내역 취소" })).not.toBeInTheDocument();
    expect(screen.getByText("취소 범위 확인 중...")).toBeInTheDocument();

    await act(async () => resolveScope([visible, hidden]));
    expect(await screen.findByRole("button", { name: "assembly 재고 · 1품목 · -7" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "이 내역 취소" }));

    expect(screen.getAllByRole("button", { name: "assembly 재고 · 1품목 · -7" })).toHaveLength(1);
    expect(screen.getByText("hidden-component")).toBeInTheDocument();
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
    expect(screen.getAllByRole("button", { name: "assembly 재고 · 1품목 · -3" })).toHaveLength(1);
    expect(screen.getByText("reference-sibling")).toBeInTheDocument();
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
