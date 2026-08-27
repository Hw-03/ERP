import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ioApi } from "@/lib/api/io";
import type { IoBatch, IoLine } from "@/lib/api/types/io";
import type { TransactionLog } from "@/lib/api/types/production";
import { BomBatchDetail } from "../BomBatchDetail";

const realtimeState = vi.hoisted(() => ({
  revision: 1 as number | null,
}));

vi.mock("@/lib/queries/realtime", () => ({
  useRealtimeRevision: () => realtimeState.revision,
}));

vi.mock("@/lib/api/io", () => ({
  ioApi: {
    getBatch: vi.fn(),
  },
}));

function makeLine(overrides: Partial<IoLine>): IoLine {
  return {
    line_id: "line",
    item_id: "item",
    item_name: "품목",
    mes_code: "MES-001",
    unit: "EA",
    direction: "out",
    from_bucket: "production",
    from_department: "조립",
    to_bucket: "none",
    to_department: null,
    quantity: 1,
    bom_expected: 1,
    included: true,
    origin: "bom_auto",
    edited: false,
    has_children: false,
    shortage: 0,
    exclusion_note: null,
    ...overrides,
  };
}

function makeBatch(): IoBatch {
  return {
    batch_id: "batch-1",
    work_type: "process",
    sub_type: "produce",
    status: "completed",
    requester_employee_id: "employee-1",
    requester_name: "작업자",
    requester_department: "조립",
    approver_employee_id: "employee-1",
    approver_name: "작업자",
    from_department: null,
    to_department: "조립",
    requires_approval: false,
    stock_request_id: null,
    reference_no: null,
    notes: null,
    created_at: "2026-07-10T00:00:00Z",
    updated_at: "2026-07-10T00:00:00Z",
    submitted_at: "2026-07-10T00:00:00Z",
    completed_at: "2026-07-10T00:00:00Z",
    bundles: [
      {
        bundle_id: "bundle-1",
        source_kind: "bom_parent",
        title: "아주 긴 완제품 구성 묶음 이름",
        source_item_id: "parent",
        source_mes_code: "PARENT-001",
        quantity: 1,
        expanded_level: 1,
        lines: [
          makeLine({
            line_id: "parent-line",
            item_id: "parent",
            item_name: "완제품",
            mes_code: "PARENT-001",
            direction: "in",
            from_bucket: "none",
            from_department: null,
            to_bucket: "production",
            to_department: "조립",
            origin: "direct",
          }),
          makeLine({
            line_id: "child-line",
            item_id: "child",
            item_name: "아주 긴 구성품 라인 이름",
            mes_code: "CHILD-001",
          }),
        ],
      },
    ],
  };
}

function makeTransactionLog(overrides: Partial<TransactionLog> = {}): TransactionLog {
  return {
    log_id: "log-1",
    item_id: "item",
    mes_code: "MES-001",
    item_name: "품목",
    item_process_type_code: "AR",
    item_unit: "EA",
    transaction_type: "BACKFLUSH",
    quantity_change: -1,
    quantity_before: 1,
    quantity_after: 0,
    warehouse_qty_before: 10,
    warehouse_qty_after: 10,
    department_qty_before: 3,
    department_qty_after: 2,
    transfer_qty: null,
    reference_no: null,
    produced_by: "작업자",
    requester_name: "작업자",
    approver_name: "작업자",
    department: "조립",
    notes: null,
    operation_batch_id: "batch-1",
    created_at: "2026-08-24T04:12:00Z",
    cancelled: false,
    cancel_reason: null,
    cancelled_by: null,
    cancelled_at: null,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function makeDuplicateManualBatch(): IoBatch {
  const batch = makeBatch();
  const makeBundle = (bundleId: string, lineId: string) => ({
    bundle_id: bundleId,
    source_kind: "manual" as const,
    title: "알루미늄 필터 (2T * Φ24)",
    source_item_id: "item",
    source_mes_code: "69-VR-0001",
    quantity: 1,
    expanded_level: 1,
    lines: [makeLine({
      line_id: lineId,
      item_id: "item",
      item_name: "알루미늄 필터 (2T * Φ24)",
      mes_code: "69-VR-0001",
      direction: "adjust",
      from_bucket: "none",
      from_department: null,
      to_bucket: "production",
      to_department: "조립",
      quantity: 1,
      bom_expected: null,
      origin: "manual",
    })],
  });

  return {
    ...batch,
    sub_type: "adjust_in",
    bundles: [makeBundle("bundle-1", "line-1"), makeBundle("bundle-2", "line-2")],
  };
}

function makeMultiItemAdjustmentBatch(): IoBatch {
  const batch = makeDuplicateManualBatch();
  batch.bundles[0] = {
    ...batch.bundles[0],
    title: "보정 품목 A",
    lines: [{ ...batch.bundles[0].lines[0], item_name: "보정 품목 A" }],
  };
  batch.bundles[1] = {
    ...batch.bundles[1],
    bundle_id: "bundle-2",
    title: "보정 품목 B",
    source_item_id: "item-2",
    source_mes_code: "MES-002",
    lines: [{
      ...batch.bundles[1].lines[0],
      line_id: "line-2",
      item_id: "item-2",
      item_name: "보정 품목 B",
      mes_code: "MES-002",
    }],
  };
  return batch;
}

beforeEach(() => {
  vi.clearAllMocks();
  realtimeState.revision = 1;
});

describe("BomBatchDetail", () => {
  it("커스텀 BOM 이력은 실행되지 않은 상위를 미반영으로 표시한다", () => {
    const batch = makeBatch();
    batch.bundles[0].lines[0] = {
      ...batch.bundles[0].lines[0],
      included: false,
      exclusion_note: "커스텀 BOM 상위 미반영",
    };
    batch.bundles[0].lines[1] = {
      ...batch.bundles[0].lines[1],
      quantity: 2,
      edited: true,
    };
    const childLog = makeTransactionLog({
      operation_line_id: "child-line",
      item_id: "child",
      quantity_change: -2,
    });

    render(
      <table><tbody><BomBatchDetail batchId={batch.batch_id} colSpan={8} cache={new Map([[batch.batch_id, batch]])} onCached={vi.fn()} logs={[childLog]} /></tbody></table>,
    );

    const parentRow = screen.getByText("아주 긴 완제품 구성 묶음 이름").closest("tr");
    expect(parentRow).not.toBeNull();
    expect(within(parentRow!).getByText("상위 미반영")).toBeInTheDocument();
    expect(within(parentRow!).queryByText("+1 EA")).not.toBeInTheDocument();
  });

  it("단품 출고는 실행 로그의 감소 부호와 재고 스냅샷을 함께 표시한다", () => {
    const batch = makeBatch();
    const line = makeLine({
      line_id: "shipment-line",
      origin: "manual",
      direction: "adjust",
      from_bucket: "production",
      to_bucket: "none",
      quantity: 1,
    });
    const directBatch: IoBatch = {
      ...batch,
      sub_type: "disassemble",
      bundles: [{
        bundle_id: "shipment-bundle",
        source_kind: "manual",
        title: "단품 출고",
        source_item_id: line.item_id,
        source_mes_code: line.mes_code,
        quantity: 1,
        expanded_level: 0,
        lines: [line],
      }],
    };
    const log = makeTransactionLog({
      operation_line_id: line.line_id,
      transaction_type: "ADJUST",
      quantity_change: -1,
      warehouse_qty_before: 202,
      warehouse_qty_after: 202,
      department_qty_before: 4,
      department_qty_after: 3,
    });

    render(
      <table><tbody><BomBatchDetail batchId={directBatch.batch_id} colSpan={8} cache={new Map([[directBatch.batch_id, directBatch]])} onCached={vi.fn()} logs={[log]} /></tbody></table>,
    );

    expect(screen.getByText("-1 EA")).toBeInTheDocument();
    expect(screen.getByLabelText("재고 변동: 창고 202 → 202, 부서 4 → 3")).toBeInTheDocument();
  });

  it("shows unique batch logs on the BOM parent and component rows", () => {
    const batch = makeBatch();
    const logs = [
      makeTransactionLog({
        log_id: "parent-log",
        item_id: "parent",
        mes_code: "PARENT-001",
        item_name: "완제품",
        transaction_type: "PRODUCE",
        quantity_change: 1,
        warehouse_qty_before: 0,
        warehouse_qty_after: 0,
        department_qty_before: 15,
        department_qty_after: 16,
      }),
      makeTransactionLog({
        log_id: "child-log",
        item_id: "child",
        mes_code: "CHILD-001",
        item_name: "아주 긴 구성품 라인 이름",
      }),
    ];

    render(
      <table><tbody><BomBatchDetail batchId={batch.batch_id} colSpan={8} cache={new Map([[batch.batch_id, batch]])} onCached={vi.fn()} logs={logs} /></tbody></table>,
    );

    expect(screen.getByLabelText("재고 변동: 창고 0 → 0, 부서 15 → 16")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "BOM 구성 펼치기" }));

    expect(screen.getByLabelText("재고 변동: 창고 10 → 10, 부서 3 → 2")).toBeInTheDocument();
  });

  it("prefers the exact operation line log when a BOM component is duplicated", () => {
    const batch = makeBatch();
    const logs = [
      makeTransactionLog({
        log_id: "other-child-log",
        item_id: "child",
        warehouse_qty_before: 90,
        warehouse_qty_after: 90,
        department_qty_before: 9,
        department_qty_after: 8,
        operation_line_id: "other-child-line",
      }),
      makeTransactionLog({
        log_id: "child-log",
        item_id: "child",
        warehouse_qty_before: 10,
        warehouse_qty_after: 10,
        department_qty_before: 3,
        department_qty_after: 2,
        operation_line_id: "child-line",
      }),
    ];

    render(
      <table><tbody><BomBatchDetail batchId={batch.batch_id} colSpan={8} cache={new Map([[batch.batch_id, batch]])} onCached={vi.fn()} logs={logs} /></tbody></table>,
    );

    fireEvent.click(screen.getByRole("button", { name: "BOM 구성 펼치기" }));

    expect(screen.getByLabelText("재고 변동: 창고 10 → 10, 부서 3 → 2")).toBeInTheDocument();
    expect(screen.queryByLabelText("재고 변동: 창고 90 → 90, 부서 9 → 9")).not.toBeInTheDocument();
  });

  it("keeps an ambiguous legacy component snapshot empty", () => {
    const batch = makeBatch();
    const logs = [
      makeTransactionLog({ log_id: "first-child-log", item_id: "child" }),
      makeTransactionLog({ log_id: "second-child-log", item_id: "child" }),
    ];

    render(
      <table><tbody><BomBatchDetail batchId={batch.batch_id} colSpan={8} cache={new Map([[batch.batch_id, batch]])} onCached={vi.fn()} logs={logs} /></tbody></table>,
    );

    fireEvent.click(screen.getByRole("button", { name: "BOM 구성 펼치기" }));

    const row = screen.getByText("아주 긴 구성품 라인 이름").closest("tr")!;
    expect(within(row).getAllByText("—")).toHaveLength(1);
  });

  it("does not use another line's linked log as a legacy fallback", () => {
    const batch = makeBatch();
    const logs = [makeTransactionLog({
      log_id: "different-linked-child-log",
      item_id: "child",
      operation_line_id: "different-child-line",
    })];

    render(
      <table><tbody><BomBatchDetail batchId={batch.batch_id} colSpan={8} cache={new Map([[batch.batch_id, batch]])} onCached={vi.fn()} logs={logs} /></tbody></table>,
    );

    fireEvent.click(screen.getByRole("button", { name: "BOM 구성 펼치기" }));

    const row = screen.getByText("아주 긴 구성품 라인 이름").closest("tr")!;
    expect(within(row).getAllByText("—")).toHaveLength(1);
  });

  it("keeps duplicate BOM lines empty when legacy logs cannot identify a line", () => {
    const batch = makeBatch();
    batch.bundles[0].lines.push({
      ...batch.bundles[0].lines[1],
      line_id: "second-child-line",
    });
    const logs = [makeTransactionLog({ log_id: "only-child-log", item_id: "child" })];

    render(
      <table><tbody><BomBatchDetail batchId={batch.batch_id} colSpan={8} cache={new Map([[batch.batch_id, batch]])} onCached={vi.fn()} logs={logs} /></tbody></table>,
    );

    fireEvent.click(screen.getByRole("button", { name: "BOM 구성 펼치기" }));

    const rows = Array.from(new Set(
      screen.getAllByText("아주 긴 구성품 라인 이름").map((element) => element.closest("tr")!),
    ));
    expect(rows).toHaveLength(2);
    rows.forEach((row) => expect(within(row).getAllByText("—")).toHaveLength(1));
  });

  it("refreshes an open BOM batch and republishes the fresh batch without collapsing it", async () => {
    const staleBatch = makeBatch();
    staleBatch.bundles[0].title = "Stale BOM Bundle";
    staleBatch.bundles[0].lines[1].item_name = "Stale BOM Child";
    const freshBatch = makeBatch();
    freshBatch.bundles[0].title = "Fresh BOM Bundle";
    freshBatch.bundles[0].lines[1].item_name = "Fresh BOM Child";
    const onCached = vi.fn();
    const refresh = deferred<IoBatch>();
    vi.mocked(ioApi.getBatch).mockReturnValue(refresh.promise);
    const cache = new Map([[staleBatch.batch_id, staleBatch]]);
    const { rerender } = render(
      <table>
        <tbody>
          <BomBatchDetail batchId={staleBatch.batch_id} colSpan={8} cache={cache} onCached={onCached} />
        </tbody>
      </table>,
    );

    fireEvent.click(screen.getByRole("button", { name: "BOM 구성 펼치기" }));
    expect(screen.getByText("Stale BOM Child")).toBeInTheDocument();

    realtimeState.revision = 2;
    rerender(
      <table>
        <tbody>
          <BomBatchDetail batchId={staleBatch.batch_id} colSpan={8} cache={cache} onCached={onCached} />
        </tbody>
      </table>,
    );

    await waitFor(() => expect(ioApi.getBatch).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Stale BOM Bundle")).toBeInTheDocument();
    expect(screen.getByText("Stale BOM Child")).toBeInTheDocument();
    expect(screen.queryByText("작업 묶음 상세 불러오는 중...")).not.toBeInTheDocument();

    await act(async () => refresh.resolve(freshBatch));
    await waitFor(() => expect(screen.getByText("Fresh BOM Bundle")).toBeInTheDocument());
    expect(onCached).toHaveBeenCalledWith(staleBatch.batch_id, freshBatch);
    expect(screen.getByText("Fresh BOM Child")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "BOM 구성 접기" })).toHaveAttribute("aria-expanded", "true");
  });

  it("uses an operation label for a warehouse-to-department BOM bundle while preserving its component names", () => {
    const batch = makeBatch();
    batch.sub_type = "warehouse_to_dept";

    render(
      <table><tbody><BomBatchDetail batchId={batch.batch_id} colSpan={8} cache={new Map([[batch.batch_id, batch]])} onCached={vi.fn()} /></tbody></table>,
    );

    expect(screen.getByText("이동 구성")).toBeInTheDocument();
    expect(screen.queryByText("아주 긴 완제품 구성 묶음 이름")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "BOM 구성 펼치기" }));
    expect(screen.getByText("아주 긴 구성품 라인 이름")).toBeInTheDocument();
  });

  it.each(["Enter", " "])("uses a real button for BOM expansion with %s", (key) => {
    const batch = makeBatch();
    render(
      <table>
        <tbody>
          <BomBatchDetail
            batchId={batch.batch_id}
            colSpan={8}
            cache={new Map([[batch.batch_id, batch]])}
            onCached={vi.fn()}
            compact
          />
        </tbody>
      </table>,
    );

    const toggle = screen.getByRole("button", { name: "BOM 구성 펼치기" });
    const controlsId = toggle.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("아주 긴 완제품 구성 묶음 이름").closest("tr")).toHaveClass("h-[40px]");

    fireEvent.keyDown(toggle, { key });

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const child = screen.getByText("아주 긴 구성품 라인 이름");
    expect(child.closest("tr")).toHaveClass("h-[40px]");
    expect(document.getElementById(controlsId!)).toBe(child.closest("tr"));
  });

  it.each(["click", "Enter", " "])("toggles an expandable BOM row with %s", (interaction) => {
    const batch = makeBatch();
    render(
      <table><tbody><BomBatchDetail batchId={batch.batch_id} colSpan={8} cache={new Map([[batch.batch_id, batch]])} onCached={vi.fn()} /></tbody></table>,
    );

    const toggle = screen.getByRole("button", { name: "BOM 구성 펼치기" });
    const row = toggle.closest("tr")!;
    const controlsId = toggle.getAttribute("aria-controls")!;

    expect(row).not.toHaveAttribute("role");
    expect(row).toHaveAttribute("tabindex", "0");
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(row).toHaveAttribute("aria-controls", controlsId);

    if (interaction === "click") fireEvent.click(row);
    else fireEvent.keyDown(row, { key: interaction });

    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(controlsId)).toBeInTheDocument();
  });

  it("merges duplicate manual item bundles into one displayed quantity", () => {
    const batch = makeDuplicateManualBatch();
    const { container } = render(
      <table>
        <tbody>
          <BomBatchDetail
            batchId={batch.batch_id}
            colSpan={8}
            cache={new Map([[batch.batch_id, batch]])}
            onCached={vi.fn()}
          />
        </tbody>
      </table>,
    );

    expect(container.querySelectorAll("tbody > tr")).toHaveLength(1);
    expect(screen.getByText("+2 EA")).toBeInTheDocument();
  });

  it("keeps shortage badges but never renders excluded badges in BOM summary or child rows", () => {
    const batch = makeBatch();
    batch.bundles[0].lines[1].shortage = 2;
    batch.bundles[0].lines.push(makeLine({
      line_id: "excluded-line",
      item_id: "excluded-item",
      item_name: "제외 구성품",
      included: false,
      shortage: 0,
    }));

    render(
      <table>
        <tbody>
          <BomBatchDetail
            batchId={batch.batch_id}
            colSpan={8}
            cache={new Map([[batch.batch_id, batch]])}
            onCached={vi.fn()}
          />
        </tbody>
      </table>,
    );

    expect(screen.getByText("부족 1")).toBeInTheDocument();
    expect(screen.queryByText("제외")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "BOM 구성 펼치기" }));

    expect(screen.queryByText("제외 구성품")).not.toBeInTheDocument();
    expect(screen.queryByText("제외")).not.toBeInTheDocument();
    expect(screen.getAllByText("부족 2")).toHaveLength(1);
  });

  it("uses the shared fixed operation pill width for the BOM section and its item rows", () => {
    const batch = makeBatch();
    render(
      <table><tbody><BomBatchDetail batchId={batch.batch_id} colSpan={8} cache={new Map([[batch.batch_id, batch]])} onCached={vi.fn()} /></tbody></table>,
    );

    expect(screen.getByText("BOM").parentElement).toHaveClass("w-32", "max-w-full");
    fireEvent.click(screen.getByRole("button", { name: "BOM 구성 펼치기" }));
    expect(screen.getByText("자동차감").parentElement).toHaveClass("w-32", "max-w-full");
  });

  it.each(["Enter", " "])("expands multi-item quantity adjustments with %s", (key) => {
    const batch = makeMultiItemAdjustmentBatch();
    render(
      <table><tbody><BomBatchDetail batchId={batch.batch_id} colSpan={8} cache={new Map([[batch.batch_id, batch]])} onCached={vi.fn()} /></tbody></table>,
    );

    expect(screen.getByText("수량보정 입고")).toBeInTheDocument();
    expect(screen.queryByText("보정 품목 A")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "라인 구성 펼치기" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.keyDown(toggle, { key });

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("보정 품목 A")).toBeInTheDocument();
    expect(screen.getByText("보정 품목 B")).toBeInTheDocument();
  });

  it("uses the approved 출고 label for a multi-item quantity adjustment", () => {
    const batch = makeMultiItemAdjustmentBatch();
    batch.sub_type = "adjust_out";
    render(
      <table><tbody><BomBatchDetail batchId={batch.batch_id} colSpan={8} cache={new Map([[batch.batch_id, batch]])} onCached={vi.fn()} /></tbody></table>,
    );

    expect(screen.getByText("출고")).toBeInTheDocument();
    expect(screen.queryByText("수량보정 입고")).not.toBeInTheDocument();
  });

  it("groups legacy manual-only production batches as quantity adjustments", () => {
    const batch = makeMultiItemAdjustmentBatch();
    batch.sub_type = "produce";
    batch.bundles = batch.bundles.map((bundle) => ({
      ...bundle,
      lines: bundle.lines.map((line) => ({
        ...line,
        direction: "in",
        from_bucket: "none",
        from_department: null,
        to_bucket: "production",
        to_department: "조립",
      })),
    }));

    render(
      <table><tbody><BomBatchDetail batchId={batch.batch_id} colSpan={8} cache={new Map([[batch.batch_id, batch]])} onCached={vi.fn()} /></tbody></table>,
    );

    expect(screen.getByText("수량보정 입고")).toBeInTheDocument();
    expect(screen.queryByText("보정 품목 A")).not.toBeInTheDocument();
  });

  it("keeps a single quantity adjustment as a direct item row", () => {
    const batch = makeMultiItemAdjustmentBatch();
    batch.bundles = [batch.bundles[0]];
    render(
      <table><tbody><BomBatchDetail batchId={batch.batch_id} colSpan={8} cache={new Map([[batch.batch_id, batch]])} onCached={vi.fn()} /></tbody></table>,
    );

    expect(screen.getByText("보정 품목 A")).toBeInTheDocument();
    expect(screen.queryByText("수량보정 입고")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "라인 구성 펼치기" })).not.toBeInTheDocument();
  });

  it("keeps the status-cell dash fallback for an exclusion-only BOM bundle", () => {
    const batch = makeBatch();
    batch.bundles[0].lines.push(makeLine({
      line_id: "excluded-line",
      item_id: "excluded-item",
      item_name: "제외 구성품",
      included: false,
      shortage: 0,
    }));

    render(
      <table>
        <tbody>
          <BomBatchDetail
            batchId={batch.batch_id}
            colSpan={8}
            cache={new Map([[batch.batch_id, batch]])}
            onCached={vi.fn()}
          />
        </tbody>
      </table>,
    );

    const headerRow = screen.getByText("아주 긴 완제품 구성 묶음 이름").closest("tr");
    expect(headerRow).not.toBeNull();
    const dash = within(headerRow!).getByText("-");
    expect(dash).toBeInTheDocument();
    expect(dash.closest("td")).toHaveClass("text-center");
    expect(dash.parentElement).toHaveClass("justify-center");
    expect(screen.queryByText("제외")).not.toBeInTheDocument();
  });

  it("keeps summary snapshots unavailable on a multi-item quantity adjustment", () => {
    const batch = makeMultiItemAdjustmentBatch();
    const logs = [
      makeTransactionLog({
        log_id: "second-log",
        item_id: "item-2",
        warehouse_qty_before: 40,
        warehouse_qty_after: 41,
        department_qty_before: 4,
        department_qty_after: 5,
      }),
      makeTransactionLog({
        log_id: "representative-log",
        item_id: "item",
        warehouse_qty_before: 7,
        warehouse_qty_after: 8,
        department_qty_before: 2,
        department_qty_after: 3,
      }),
    ];

    render(
      <table><tbody><BomBatchDetail batchId={batch.batch_id} colSpan={8} cache={new Map([[batch.batch_id, batch]])} onCached={vi.fn()} logs={logs} /></tbody></table>,
    );

    const summaryRow = screen.getByText("수량보정 입고").closest("tr")!;
    expect(within(summaryRow).queryByLabelText(/^재고 변동:/)).not.toBeInTheDocument();
    expect(within(summaryRow).getAllByText("—")).toHaveLength(1);
  });

  it("uses each line's exact log for a non-summary multi-item batch", () => {
    const batch = makeMultiItemAdjustmentBatch();
    batch.sub_type = "warehouse_to_dept";
    const logs = [
      makeTransactionLog({
        log_id: "first-line-log",
        item_id: "item",
        operation_line_id: "line-1",
        warehouse_qty_before: 7,
        warehouse_qty_after: 8,
        department_qty_before: 2,
        department_qty_after: 3,
      }),
      makeTransactionLog({
        log_id: "second-line-log",
        item_id: "item-2",
        operation_line_id: "line-2",
        warehouse_qty_before: 40,
        warehouse_qty_after: 41,
        department_qty_before: 4,
        department_qty_after: 5,
      }),
    ];

    render(
      <table><tbody><BomBatchDetail batchId={batch.batch_id} colSpan={8} cache={new Map([[batch.batch_id, batch]])} onCached={vi.fn()} logs={logs} /></tbody></table>,
    );

    expect(screen.getByLabelText("재고 변동: 창고 7 → 8, 부서 2 → 3")).toBeInTheDocument();
    expect(screen.getByLabelText("재고 변동: 창고 40 → 41, 부서 4 → 5")).toBeInTheDocument();
  });

  it("keeps both stock snapshot cells unavailable for configuration-only rows", () => {
    const batch = makeBatch();
    render(
      <table><tbody><BomBatchDetail batchId={batch.batch_id} colSpan={8} cache={new Map([[batch.batch_id, batch]])} onCached={vi.fn()} /></tbody></table>,
    );

    const bundleRow = screen.getByText("아주 긴 완제품 구성 묶음 이름").closest("tr")!;
    expect(within(bundleRow).getAllByText("—")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "BOM 구성 펼치기" }));
    const lineRow = screen.getByText("아주 긴 구성품 라인 이름").closest("tr")!;
    expect(within(lineRow).getAllByText("—")).toHaveLength(1);
  });

  it("shows the internal-use BOM mode and every child inventory effect", () => {
    const batch = makeBatch();
    batch.work_type = "internal_use";
    batch.sub_type = "internal_use_out";
    batch.bundles[0] = {
      ...batch.bundles[0],
      internal_use_bom_mode: "parent_and_children",
      lines: [
        makeLine({
          line_id: "parent-line",
          item_id: "parent",
          item_name: "상위 자재",
          origin: "direct",
          direction: "out",
          from_bucket: "warehouse",
          from_department: null,
          to_bucket: "none",
          to_department: null,
          selected: true,
        }),
        makeLine({
          line_id: "selected-child",
          item_id: "selected-child",
          item_name: "선택 하위",
          selected: true,
        }),
        makeLine({
          line_id: "returned-child",
          item_id: "returned-child",
          item_name: "재입고 하위",
          direction: "in",
          from_bucket: "none",
          from_department: null,
          to_bucket: "production",
          to_department: "가공",
          selected: false,
        }),
        makeLine({
          line_id: "unchanged-child",
          item_id: "unchanged-child",
          item_name: "변동 없는 하위",
          included: false,
          selected: false,
        }),
      ],
    };

    render(
      <table><tbody><BomBatchDetail batchId={batch.batch_id} colSpan={8} cache={new Map([[batch.batch_id, batch]])} onCached={vi.fn()} /></tbody></table>,
    );

    expect(screen.getByText("상·하위 차감")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "BOM 구성 펼치기" }));

    expect(screen.getByText("재입고 하위")).toBeInTheDocument();
    expect(screen.getByText("변동 없는 하위")).toBeInTheDocument();
    expect(screen.getByText("소속 부서 재입고")).toBeInTheDocument();
    expect(screen.getByText("변동 없음")).toBeInTheDocument();
  });
});
