import { fireEvent, render, screen } from "@testing-library/react";
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
  SlidePanel: ({ modal, labelledBy, contentClassName, children }: any) => (
    <aside
      data-testid="desktop-history-slide-panel"
      data-modal={modal === false ? "false" : "unset"}
      data-labelled-by={labelledBy ?? ""}
      data-content-class={contentClassName ?? ""}
    >
      {children}
    </aside>
  ),
}));

vi.mock("../../DesktopRightPanel", () => ({
  DesktopRightPanel: ({ title, titleId, fillAvailableWidth, backButton, headerAction, tone, children }: any) => (
    <div
      data-testid="desktop-history-right-panel"
      data-fill-width={fillAvailableWidth ? "true" : "false"}
      data-tone={tone ?? "default"}
    >
      <h2 id={titleId}>{title}</h2>
      {backButton}
      {headerAction}
      {children}
    </div>
  ),
}));

vi.mock("../HistoryDetailPanel", async () => {
  const { useEffect } = await import("react");
  return {
    HistoryDetailPanel: ({ selected, allowCancellation, desktopCancellationOpen, onDesktopCancellationOpenChange }: any) => {
      useEffect(() => {
        detailLifecycle.logMounted();
        return () => detailLifecycle.logUnmounted();
      }, []);
      return (
        <div data-testid="history-detail-panel" data-allow-cancellation={allowCancellation === false ? "false" : "true"}>
          {desktopCancellationOpen ? "취소 확인 내용" : selected.item_name}
          <button type="button" onClick={() => onDesktopCancellationOpenChange?.(true)}>취소 화면 열기</button>
        </div>
      );
    },
  };
});

vi.mock("../HistoryBatchDetailPanel", async () => {
  const { useEffect } = await import("react");
  return {
    HistoryBatchDetailPanel: ({ logs, desktopCancellationOpen, onDesktopCancellationOpenChange }: any) => {
      useEffect(() => {
        detailLifecycle.batchMounted();
        return () => detailLifecycle.batchUnmounted();
      }, []);
      return (
        <div data-testid="history-batch-detail-panel">
          {desktopCancellationOpen ? "묶음 취소 확인 내용" : logs[0].item_name}
          <button type="button" onClick={() => onDesktopCancellationOpenChange?.(true)}>묶음 취소 화면 열기</button>
        </div>
      );
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
  it("제출 상세는 하위 레거시 배치 캐시로 제목과 사유 및 검색 결과를 표시한다", () => {
    const component = makeLog({ log_id: "component", item_id: "component", item_name: "검색된 구성품" });
    const primary = makeLog({ operation_batch_id: "batch-1", reason_category: "이전 사유", reason_memo: "이전 메모" });
    const batch = makeDuplicateManualBatch();
    batch.bundles = [batch.bundles[0]];
    batch.bundles[0].title = primary.item_name;
    const group = { type: "submission" as const, key: "submission:legacy", logs: [component, primary], workGroups: [
      { type: "op_batch" as const, batchId: "batch-1", refNo: null, logs: [component, primary], matchedLogIds: [component.log_id] },
    ] };
    render(panel({ kind: "submission", group }, new Map([["batch-1", batch]])));
    expect(screen.getByRole("heading", { name: primary.item_name })).toBeInTheDocument();
    const card = screen.getByRole("button", { name: /이전 사유/ });
    expect(card).toHaveTextContent("이전 메모");
    expect(card).toHaveTextContent("검색 일치 · 검색된 구성품");
    expect(screen.queryByText("작업 정보 확인 중")).not.toBeInTheDocument();
  });
  it("제출 요약에는 취소 액션이 없고 작업을 원래 상세로 연결한다", () => {
    const first = makeLog({ operation_id: "work-1", operation_role: "PRIMARY" });
    const second = makeLog({ log_id: "log-2", item_id: "item-2", item_name: "부품 B", operation_id: "work-2", operation_role: "PRIMARY" });
    const group = { type: "submission" as const, key: "submission:id", logs: [first, second], workGroups: [
      { type: "operation" as const, operationId: "work-1", logs: [first] },
      { type: "operation" as const, operationId: "work-2", logs: [second] },
    ] };
    const onSelectWork = vi.fn();
    render(<DesktopHistoryRightPanel selection={{ kind: "submission", group }} displaySelection={{ kind: "submission", group }}
      batchCache={new Map()} setBatchCache={vi.fn()} onSelectLog={vi.fn()} onSelectWork={onSelectWork}
      canGoBack={false} onBack={vi.fn()} onLogUpdated={vi.fn()} onBatchCancelled={vi.fn()}
      onFocusLineInList={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByTestId("history-batch-detail-panel")).not.toBeInTheDocument();
    expect(screen.queryByText("취소 화면 열기")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /부품 B/ }));
    expect(onSelectWork).toHaveBeenCalledWith(group.workGroups[1]);
  });
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
    expect(slidePanel).toHaveAttribute("data-content-class", "pl-0");
    expect(screen.getByTestId("desktop-history-right-panel")).toHaveAttribute("data-fill-width", "true");
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

  it("switches a log detail to a danger-tinted cancellation panel with a header return action", () => {
    const selection = { kind: "log" as const, log: makeLog({ item_name: "단일 품목" }) };
    render(panel(selection));

    fireEvent.click(screen.getByRole("button", { name: "취소 화면 열기" }));

    expect(screen.getByRole("heading", { name: "내역 취소" })).toBeInTheDocument();
    expect(screen.getByText("취소 확인 내용")).toBeInTheDocument();
    expect(screen.getByTestId("desktop-history-right-panel")).toHaveAttribute("data-tone", "danger");
    expect(screen.getByRole("button", { name: "상세로 돌아가기" })).toHaveClass("h-8", "w-8");

    fireEvent.click(screen.getByRole("button", { name: "상세로 돌아가기" }));
    expect(screen.getByRole("heading", { name: "단일 품목" })).toBeInTheDocument();
  });

  it("switches a batch detail to the dedicated cancellation panel", () => {
    const selection = {
      kind: "batch" as const,
      batchId: "batch-1",
      logs: [makeLog({ item_name: "묶음 품목", operation_batch_id: "batch-1" })],
    };
    render(panel(selection));

    fireEvent.click(screen.getByRole("button", { name: "묶음 취소 화면 열기" }));

    expect(screen.getByRole("heading", { name: "내역 취소" })).toBeInTheDocument();
    expect(screen.getByText("묶음 취소 확인 내용")).toBeInTheDocument();
    expect(screen.getByTestId("desktop-history-right-panel")).toHaveAttribute("data-tone", "danger");
  });
});
