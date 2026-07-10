import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TransactionLog } from "@/lib/api";
import type { IoBatch } from "@/lib/api/types/io";
import { MobileHistoryScreen } from "../MobileHistoryScreen";

const testState = vi.hoisted(() => ({
  historyResult: null as any,
  batch: null as any,
}));

vi.mock("../../../_hooks/useHistoryData", () => ({
  useHistoryData: () => testState.historyResult,
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
  testState.batch = makeBatch();
  setHistoryLogs([makeLog()]);
});

describe("MobileHistoryScreen real detail panels", () => {
  it("keeps the existing single-log Hero, inventory effect, and Meta cancel placement", async () => {
    renderScreen();
    fireEvent.click(screen.getByText("완제품 A").closest("button")!);

    expect(await screen.findByText("처리 전")).toBeInTheDocument();
    expect(screen.getByText("재고 영향")).toBeInTheDocument();
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
});
