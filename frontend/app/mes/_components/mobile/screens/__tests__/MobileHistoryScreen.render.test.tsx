import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TransactionLog } from "@/lib/api";
import type { IoBatch } from "@/lib/api/types/io";
import { buildGroups } from "../../../_history_sections/historyTableHelpers";
import type { TransactionDisplayGroup } from "@/lib/api/production";
import { productionApi } from "@/lib/api/production";
import { MobileHistoryScreen } from "../MobileHistoryScreen";

const testState = vi.hoisted(() => ({
  historyResult: null as any,
  batch: null as any,
}));

vi.mock("../../../_hooks/useHistoryGroups", () => ({
  useHistoryGroups: () => ({ ...testState.historyResult, groups: testState.historyResult.groups ?? buildGroups(testState.historyResult!.logs).map((g) => ({
        type: g.type, key: g.type === "solo" ? g.log.log_id : g.type === "operation" ? g.operationId : g.type === "op_batch" ? g.batchId : g.type === "batch" ? g.refKey : g.key,
        logs: g.type === "solo" ? [g.log] : g.type === "defect_lifecycle" ? [g.parent, g.child] : g.logs,
      })),
      setGroups: (update: React.SetStateAction<TransactionDisplayGroup[]>) => {
        const previous = testState.historyResult!.logs.map((log) => ({ type: "solo" as const, key: log.log_id, logs: [log] }));
        const next = typeof update === "function" ? update(previous) : update;
        testState.historyResult!.setLogs(next.flatMap((group) => group.logs));
      },
      refreshLoaded: vi.fn(), }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getTransactions: vi.fn(),
    getTransactionEdits: vi.fn().mockResolvedValue([]),
    cancelTransaction: vi.fn(),
  },
}));

vi.mock("@/lib/api/io", () => ({
  ioApi: {
    getBatch: vi.fn(() => Promise.resolve(testState.batch)),
  },
}));

vi.mock("@/lib/api/production", () => ({
  productionApi: {
    getTransactions: vi.fn(() => Promise.resolve(testState.historyResult.logs)),
    getTransactionsSummary: vi.fn(() => new Promise(() => {})),
    previewInventoryOperationCancellation: vi.fn(() => Promise.resolve({ canCancel: true, blockers: [], cells: [], effects: [] })),
  },
}));

vi.mock("@/lib/queries/useModelsQuery", () => ({
  useModelsQuery: () => ({ data: [] }),
}));

vi.mock("@/lib/queries/useTransactionsQuery", () => ({
  useMonthlyCountsQuery: () => ({ data: {} }),
}));

vi.mock("@/lib/ui/BottomSheet", () => ({
  BottomSheet: ({ open, children }: any) => open ? <div data-testid="real-panel-sheet">{children}</div> : null,
}));

vi.mock("../../../login/useCurrentOperator", () => ({
  useCurrentOperator: () => ({ employee_code: "E001", name: "요청자 A" }),
}));

vi.mock("../../../_history_sections/HistoryStatsBar", () => ({ HistoryStatsBar: () => null }));
vi.mock("../../../_history_sections/HistoryFilterBar", () => ({ HistoryFilterBar: () => null }));
vi.mock("../../../_history_sections/HistoryFilterPanel", () => ({ HistoryFilterPanel: () => null }));
vi.mock("../../../_history_sections/HistoryCalendarPanel", () => ({ HistoryCalendarPanel: () => null }));

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
    quantity_before: 10,
    quantity_after: 12,
    warehouse_qty_before: 10,
    warehouse_qty_after: 12,
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
      { scope: "location", department: "조립", status: "PRODUCTION", delta: 2 },
    ],
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
            item_id: "component-a",
            item_name: "구성 검산 라인",
            mes_code: "R-001",
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
  };
}

function setHistoryLogs(logs: TransactionLog[]): void {
  testState.historyResult = {
    logs,
    loading: false,
    error: null,
    retry: vi.fn(),
    loadingMore: false,
    loadMoreError: null,
    canLoadMore: false,
    loadMore: vi.fn(),
    setLogs: vi.fn(),
  };
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MobileHistoryScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  testState.batch = makeBatch();
  setHistoryLogs([makeLog()]);
});

describe("MobileHistoryScreen real detail panels", () => {
  it("원장 격리 제출 상세는 0인 앵커 순변동 대신 작업별 이동량과 단위를 표시한다", () => {
    const first = makeLog({ operation_id: "quarantine-a", operation_role: "PRIMARY", transaction_type: "MARK_DEFECTIVE",
      quantity_change: 0, transfer_qty: null, inventory_effect: [
        { scope: "location", department: "튜브", status: "PRODUCTION", delta: -1 },
        { scope: "location", department: "튜브", status: "DEFECTIVE", delta: 1 },
      ] });
    const second = makeLog({ log_id: "second", item_id: "second", item_name: "격리 원품목 B", operation_id: "quarantine-b",
      operation_role: "PRIMARY", transaction_type: "MARK_DEFECTIVE", quantity_change: 0, transfer_qty: 2, item_unit: "m" });
    setHistoryLogs([first, second]);
    testState.historyResult.groups = [{ type: "submission", key: "submission:ledger", logs: [first, second], workGroups: [
      { type: "operation", key: "quarantine-a", logs: [first] }, { type: "operation", key: "quarantine-b", logs: [second] },
    ] }];
    renderScreen();
    fireEvent.click(screen.getByText(/완제품 A/).closest("button")!);
    const sheet = screen.getByTestId("real-panel-sheet");
    expect(within(sheet).getByRole("button", { name: /완제품 A/ })).toHaveTextContent("1 EA");
    expect(within(sheet).getByRole("button", { name: /격리 원품목 B/ })).toHaveTextContent("2 m");
    expect(within(sheet).queryByText("0 EA")).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "이 내역 취소" })).not.toBeInTheDocument();
  });
  it("모바일 제출의 검색 구성품을 사유와 함께 강조하고 기존 구성품 상세로 연결한다", async () => {
    const first = makeLog({ operation_batch_id: "batch-1", reason_category: "접촉 불량", reason_memo: "핀 확인" });
    const child = makeLog({ log_id: "component", item_id: "component-a", item_name: "부품 A", mes_code: "R-001",
      operation_batch_id: "batch-1", transaction_type: "BACKFLUSH", quantity_change: -4 });
    testState.batch.bundles[0].lines[1].item_name = child.item_name;
    const second = makeLog({ log_id: "second", item_id: "second", item_name: "완제품 B", operation_id: "work-b", operation_role: "PRODUCT_OUTPUT" });
    setHistoryLogs([child, first, second]);
    testState.historyResult.groups = [{ type: "submission", key: "submission:match", logs: [child, first, second], matchedLogIds: [child.log_id], workGroups: [
      { type: "op_batch", key: "batch-1", logs: [child, first], matchedLogIds: [child.log_id] },
      { type: "operation", key: "work-b", logs: [second], matchedLogIds: [] },
    ] }];
    renderScreen();
    await screen.findByText(/완제품 A/);
    fireEvent.click(screen.getByText(/완제품 A/).closest("button")!);
    const sheet = screen.getByTestId("real-panel-sheet");
    const card = within(sheet).getByRole("button", { name: /접촉 불량/ });
    expect(card).toHaveAttribute("data-history-search-match", "true");
    expect(card).toHaveTextContent("핀 확인");
    expect(card).toHaveTextContent("요청자 A");
    expect(card).toHaveTextContent("검색 일치 · 부품 A (R-001)");
    fireEvent.click(card);
    const childDetail = await within(sheet).findByRole("button", { name: "부품 A R-001 상세", exact: true });
    await act(async () => { fireEvent.click(childDetail); });
    expect(within(sheet).queryByRole("button", { name: "이 내역 취소" })).not.toBeInTheDocument();
  });
  it("제출 요약에는 취소가 없고 작업 상세는 원 작업 ID를 조회한다", async () => {
    const first = makeLog({ operation_id: "work-a", operation_role: "PRODUCT_OUTPUT" });
    const second = makeLog({ log_id: "second", item_id: "second", item_name: "완제품 B", operation_id: "work-b", operation_role: "PRODUCT_OUTPUT" });
    setHistoryLogs([first, second]);
    testState.historyResult.groups = [{ type: "submission", key: "submission:id", logs: [first, second], workGroups: [
      { type: "operation", key: "work-a", logs: [first] }, { type: "operation", key: "work-b", logs: [second] },
    ] }];
    renderScreen();
    fireEvent.click(screen.getByText(/완제품 A/).closest("button")!);
    const sheet = screen.getByTestId("real-panel-sheet");
    expect(within(sheet).queryByRole("button", { name: "이 내역 취소" })).not.toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole("button", { name: /완제품 A/ }));
    await waitFor(() => expect(productionApi.getTransactions).toHaveBeenCalledWith(
      { operationId: "work-a", limit: 2000, skip: 0 }, expect.anything(),
    ));
    expect(within(sheet).getByRole("button", { name: "이 내역 취소" })).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole("button", { name: "← 뒤로" }));
    expect(within(sheet).queryByRole("button", { name: "이 내역 취소" })).not.toBeInTheDocument();
  });
  it("keeps the existing single-log Hero, inventory effect, and Meta cancel placement", async () => {
    renderScreen();
    fireEvent.click(screen.getByText("완제품 A").closest("button")!);

    expect(await screen.findByText("처리 전")).toBeInTheDocument();
    expect(screen.getByText("재고 변화")).toBeInTheDocument();
    const cancel = screen.getByRole("button", { name: "이 내역 취소" });
    expect(within(cancel.parentElement!).getByText("PF-001")).toBeInTheDocument();
  });

  it("keeps batch cancel in the Hero and exposes composition without a toggle", async () => {
    setHistoryLogs([
      makeLog({ operation_batch_id: "batch-1" }),
      makeLog({
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
      }),
    ]);
    renderScreen();
    fireEvent.click(screen.getByText("완제품 A").closest("button")!);

    expect(await screen.findByText("구성 검산 라인")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /구성 .*묶음/ })).not.toBeInTheDocument();
    const cancel = screen.getByRole("button", { name: "이 내역 취소" });
    await waitFor(() => expect(cancel.closest("div.rounded-\\[20px\\]")).toBeInTheDocument());
  });

  it("keeps a long component name, code, and quantity while navigating from the mobile batch detail and back", async () => {
    const longName = "ComponentWithAVeryLongUnbrokenEnglishNameForMobileHistoryDetail";
    testState.batch.bundles[0].lines[1].item_name = longName;
    setHistoryLogs([
      makeLog({ operation_batch_id: "batch-1" }),
      makeLog({
        log_id: "component",
        item_id: "component-a",
        item_name: longName,
        mes_code: "R-001",
        transaction_type: "BACKFLUSH",
        quantity_change: -4,
        operation_batch_id: "batch-1",
        request_order_stock: { status: "available", reason: null, warehouse_qty_before: 10, warehouse_qty_after: 10, department_qty_before: 10, department_qty_after: 6 },
        inventory_effect: [{ scope: "location", department: "조립", status: "PRODUCTION", delta: -4 }],
      }),
    ]);
    renderScreen();
    fireEvent.click(screen.getByText("완제품 A").closest("button")!);

    const itemButton = await screen.findByRole("button", {name:`${longName} R-001 상세`,exact:true});
    const line = itemButton.parentElement!.parentElement!;
    expect(within(line).getByText("R-001")).toBeInTheDocument();
    expect(within(line).getByLabelText("조립 10 −4→6")).toBeInTheDocument();
    expect(within(line).queryByText("-4 EA")).not.toBeInTheDocument();
    fireEvent.click(itemButton);
    expect(await screen.findByRole("button", { name: "← 뒤로" })).toBeInTheDocument();
    expect(within(screen.getByTestId("real-panel-sheet")).queryByRole("button", { name: "이 내역 취소" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "← 뒤로" }));
    expect(await screen.findByText(longName)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "← 뒤로" })).not.toBeInTheDocument();
  });
});
