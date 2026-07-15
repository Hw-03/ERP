import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { TransactionLog } from "@/lib/api";
import type { IoBatch } from "@/lib/api/types/io";
import { queryKeys } from "@/lib/queries/keys";
import { DesktopHistoryView } from "../DesktopHistoryView";

const testState = vi.hoisted(() => ({
  historyResult: null as any,
  historyArgs: null as any,
  batch: null as any,
  updated: null as any,
  drillTarget: null as any,
  capturedLogUpdated: null as null | ((updated: TransactionLog) => void),
  summaryMock: vi.fn(),
  referenceSummaryQuery: { data: [], isLoading: false, refetch: vi.fn() },
  queryClient: null as QueryClient | null,
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: () => testState.queryClient,
  };
});

vi.mock("../_hooks/useDesktopHistoryGroups", () => ({
  useDesktopHistoryGroups: (args: any) => {
    testState.historyArgs = args;
    return testState.historyResult;
  },
}));

vi.mock("@/lib/api", () => ({
  api: {
    getTransactions: vi.fn(),
  },
}));

vi.mock("@/lib/api/production", () => ({
  productionApi: {
    getTransactionsSummary: (...args: any[]) => testState.summaryMock(...args),
  },
}));

vi.mock("@/lib/queries/useModelsQuery", () => ({
  useModelsQuery: () => ({ data: [] }),
}));

vi.mock("@/lib/queries/useTransactionsQuery", () => ({
  useMonthlyCountsQuery: () => ({ data: {} }),
  useTransactionReferenceSummariesQuery: () => testState.referenceSummaryQuery,
}));

vi.mock("../_history_sections/HistoryStatsBar", () => ({ HistoryStatsBar: () => null }));
vi.mock("../_history_sections/HistoryFilterBar", () => ({
  HistoryFilterBar: ({ setDateFilter }: any) => (
    <button type="button" onClick={() => setDateFilter("WEEK")}>기간 변경</button>
  ),
}));
vi.mock("../_history_sections/HistoryFilterPanel", () => ({ HistoryFilterPanel: () => null }));
vi.mock("../_history_sections/HistoryCalendarPanel", () => ({ HistoryCalendarPanel: () => null }));

vi.mock("../_history_sections/HistoryTable", () => ({
  HistoryTable: ({
    filteredLogs,
    selection,
    onSelectLog,
    onSelectBatch,
    setBatchCache,
    onRetry,
  }: any) => (
    <div
      data-testid="history-table-state"
      data-selection={selection?.kind ?? "none"}
      data-list-cancelled={filteredLogs.length > 0 && filteredLogs.every((log: TransactionLog) => log.cancelled) ? "yes" : "no"}
    >
      <button type="button" onClick={() => filteredLogs[0] && onSelectLog(filteredLogs[0])}>
        단건 선택
      </button>
      <button
        type="button"
        onClick={() => {
          setBatchCache(new Map([["batch-1", testState.batch]]));
          onSelectBatch("batch-1", filteredLogs);
        }}
      >
        묶음 선택
      </button>
      <button type="button" onClick={onRetry}>목록 재시도</button>
    </div>
  ),
}));

vi.mock("../_history_sections/DesktopHistoryRightPanel", () => ({
  DesktopHistoryRightPanel: ({
    selection,
    batchCache,
    onBatchCancelled,
    onLogUpdated,
    onSelectLog,
    canGoBack,
    onBack,
  }: any) => (
    <div
      data-testid="history-right-panel-state"
      data-open={selection ? "yes" : "no"}
      data-name={selection?.kind === "log" ? selection.log.item_name : ""}
      data-selection-cancelled={
        selection?.kind === "log"
          ? (selection.log.cancelled ? "yes" : "no")
          : selection?.kind === "batch" && selection.logs.every((log: TransactionLog) => log.cancelled)
          ? "yes"
          : "no"
      }
      data-cache-status={batchCache.get("batch-1")?.status ?? "missing"}
    >
      {selection?.kind === "batch" && (
        <button
          type="button"
          onClick={() => onBatchCancelled("batch-1", testState.updated)}
        >
          묶음 취소 성공
        </button>
      )}
      {selection?.kind === "log" && testState.drillTarget && (
        <button type="button" onClick={() => onSelectLog(testState.drillTarget)}>드릴 이동</button>
      )}
      {selection?.kind === "log" && (
        <>
          <button type="button" onClick={() => { testState.capturedLogUpdated = onLogUpdated; }}>
            취소 콜백 보관
          </button>
          <button type="button" onClick={() => onLogUpdated(testState.updated)}>단건 취소 성공</button>
        </>
      )}
      {canGoBack && <button type="button" onClick={onBack}>뒤로</button>}
    </div>
  ),
}));

function makeLog(overrides: Partial<TransactionLog> = {}): TransactionLog {
  return {
    log_id: "log-1",
    item_id: "item-1",
    mes_code: "R-001",
    item_name: "이전 객체",
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
    operation_batch_id: "batch-1",
    created_at: "2026-07-10T01:00:00Z",
    cancelled: false,
    cancel_reason: null,
    cancelled_by: null,
    cancelled_at: null,
    inventory_effect: [
      { scope: "location", department: "조립", status: "PRODUCTION", delta: -1 },
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
    updated_at: "2026-07-10T01:00:00Z",
    submitted_at: "2026-07-10T01:00:00Z",
    completed_at: "2026-07-10T01:00:00Z",
    bundles: [],
  };
}

function setHistoryResult(logs: TransactionLog[], loading: boolean, error: string | null = null): void {
  testState.historyResult = {
    groups: logs.map((log) => ({ type: "solo", key: `solo:${log.log_id}`, logs: [log] })),
    loading,
    error,
    retry: vi.fn(),
    loadingMore: false,
    loadMoreError: null,
    canLoadMore: false,
    loadMore: vi.fn(),
    setGroups: (update: React.SetStateAction<any[]>) => {
      const next = typeof update === "function" ? update(testState.historyResult.groups) : update;
      testState.historyResult = { ...testState.historyResult, groups: next };
    },
  };
}

beforeEach(() => {
  testState.queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  testState.historyArgs = null;
  testState.batch = makeBatch();
  testState.drillTarget = null;
  testState.capturedLogUpdated = null;
  testState.summaryMock.mockReset();
  testState.summaryMock.mockImplementation(() => new Promise(() => {}));
  testState.updated = makeLog({
    cancelled: true,
    cancel_reason: "입력 오류",
    cancelled_by: "employee-1",
    cancelled_at: "2026-07-10T02:00:00Z",
  });
  setHistoryResult([makeLog()], false);
});

describe("DesktopHistoryView history state", () => {
  it("keeps the history group query independent from a changing summary total", async () => {
    testState.summaryMock.mockResolvedValue({
      total: 42,
      warehouseCount: 12,
      deptCount: 25,
      adjustCount: 5,
      departmentCounts: {},
    });
    render(<DesktopHistoryView />);

    await waitFor(() => expect(testState.historyArgs).toMatchObject({ operations: "" }));

    testState.summaryMock.mockImplementation(() => new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: "기간 변경" }));
    await waitFor(() => expect(testState.historyArgs).toMatchObject({ dateFilter: "WEEK" }));
  });

  it("retries the list and filtered summary together and clears a failed summary", async () => {
    testState.summaryMock.mockResolvedValue({
      total: 42,
      warehouseCount: 12,
      deptCount: 25,
      adjustCount: 5,
      departmentCounts: {},
    });
    render(<DesktopHistoryView />);
    await waitFor(() => expect(testState.historyArgs).toMatchObject({ operations: "" }));
    const callsBeforeRetry = testState.summaryMock.mock.calls.length;
    const retry = testState.historyResult.retry;
    testState.summaryMock.mockRejectedValue(new Error("summary 실패"));

    fireEvent.click(screen.getByRole("button", { name: "목록 재시도" }));

    expect(retry).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(testState.summaryMock.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
      expect(testState.historyArgs).toMatchObject({ operations: "" });
    });
  });

  it("keeps selection during loading/error, refreshes it on success, and closes stale selection", async () => {
    const { rerender } = render(<DesktopHistoryView />);
    fireEvent.click(screen.getByRole("button", { name: "단건 선택" }));
    expect(screen.getByTestId("history-right-panel-state")).toHaveAttribute("data-name", "이전 객체");

    const failedLogs: TransactionLog[] = [];
    setHistoryResult(failedLogs, true);
    rerender(<DesktopHistoryView />);
    expect(screen.getByTestId("history-right-panel-state")).toHaveAttribute("data-name", "이전 객체");

    setHistoryResult(failedLogs, false, "조회 실패");
    rerender(<DesktopHistoryView />);
    expect(screen.getByTestId("history-right-panel-state")).toHaveAttribute("data-name", "이전 객체");

    setHistoryResult([], true);
    rerender(<DesktopHistoryView />);
    const fresh = makeLog({ item_name: "최신 객체" });
    setHistoryResult([fresh], false);
    rerender(<DesktopHistoryView />);
    await waitFor(() => {
      expect(screen.getByTestId("history-right-panel-state")).toHaveAttribute("data-name", "최신 객체");
    });

    setHistoryResult([], true);
    rerender(<DesktopHistoryView />);
    setHistoryResult([], false);
    rerender(<DesktopHistoryView />);
    await waitFor(() => {
      expect(screen.getByTestId("history-right-panel-state")).toHaveAttribute("data-open", "no");
      expect(screen.getByTestId("history-table-state")).toHaveAttribute("data-selection", "none");
    });
  });

  it("synchronizes list, selected batch logs, and batch cache immediately after cancellation", async () => {
    const transactionListKey = queryKeys.transactions.list({ screen: "desktop-history" });
    testState.queryClient?.setQueryData(transactionListKey, [makeLog()]);
    const logs = [makeLog(), makeLog({ log_id: "log-2", item_id: "item-2" })];
    setHistoryResult(logs, false);
    const { rerender } = render(<DesktopHistoryView />);
    fireEvent.click(screen.getByRole("button", { name: "묶음 선택" }));
    expect(screen.getByTestId("history-right-panel-state")).toHaveAttribute("data-cache-status", "completed");

    fireEvent.click(screen.getByRole("button", { name: "묶음 취소 성공" }));
    rerender(<DesktopHistoryView />);

    await waitFor(() => {
      expect(screen.getByTestId("history-table-state")).toHaveAttribute("data-list-cancelled", "yes");
      expect(screen.getByTestId("history-right-panel-state")).toHaveAttribute("data-selection-cancelled", "yes");
      expect(screen.getByTestId("history-right-panel-state")).toHaveAttribute("data-cache-status", "cancelled");
      expect(testState.queryClient?.getQueryState(transactionListKey)?.isInvalidated).toBe(true);
    });
  });

  it("patches same-reference logs and a stacked selection without replacing the current target", async () => {
    const referenceNo = "defect-disassemble:rework-1";
    const referenceLogs = [
      makeLog({
        operation_batch_id: null,
        reference_no: referenceNo,
        shipping_phase: "parent",
        item_name: "재작업 부모",
      }),
      makeLog({
        log_id: "log-2",
        item_id: "item-2",
        operation_batch_id: null,
        reference_no: referenceNo,
        shipping_phase: "component",
        item_name: "재작업 부품",
      }),
    ];
    const drillTarget = makeLog({
      log_id: "other",
      item_id: "other-item",
      operation_batch_id: null,
      item_name: "현재 대상",
    });
    testState.drillTarget = drillTarget;
    testState.updated = {
      ...referenceLogs[0],
      cancelled: true,
      cancel_reason: "재작업 취소",
      cancelled_by: "employee-1",
      cancelled_at: "2026-07-10T02:00:00Z",
    };
    setHistoryResult([...referenceLogs, drillTarget], false);
    const { rerender } = render(<DesktopHistoryView />);

    fireEvent.click(screen.getByRole("button", { name: "단건 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "드릴 이동" }));
    expect(screen.getByTestId("history-right-panel-state")).toHaveAttribute("data-name", "현재 대상");
    fireEvent.click(screen.getByRole("button", { name: "단건 취소 성공" }));
    rerender(<DesktopHistoryView />);

    expect(screen.getByTestId("history-right-panel-state")).toHaveAttribute("data-name", "현재 대상");
    expect(screen.getByTestId("history-table-state")).toHaveAttribute("data-list-cancelled", "no");
    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
    await waitFor(() => {
      expect(screen.getByTestId("history-right-panel-state")).toHaveAttribute("data-name", "재작업 부모");
      expect(screen.getByTestId("history-right-panel-state")).toHaveAttribute("data-selection-cancelled", "yes");
      const cancelledReferenceLogs = testState.historyResult.groups.flatMap((group: any) => group.logs).filter(
        (log: TransactionLog) => log.reference_no === referenceNo,
      );
      expect(cancelledReferenceLogs.every((log: TransactionLog) => log.cancelled)).toBe(true);
    });
  });

  it("uses current parent state when a stale cancellation callback resolves", async () => {
    const first = makeLog({ operation_batch_id: null, item_name: "이전 요청 대상" });
    const current = makeLog({
      log_id: "current",
      item_id: "current-item",
      operation_batch_id: null,
      item_name: "현재 대상",
    });
    testState.drillTarget = current;
    testState.updated = {
      ...first,
      cancelled: true,
      cancel_reason: "늦은 응답",
      cancelled_by: "employee-1",
      cancelled_at: "2026-07-10T02:00:00Z",
    };
    setHistoryResult([first, current], false);
    const { rerender } = render(<DesktopHistoryView />);

    fireEvent.click(screen.getByRole("button", { name: "단건 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "취소 콜백 보관" }));
    fireEvent.click(screen.getByRole("button", { name: "드릴 이동" }));
    expect(screen.getByTestId("history-right-panel-state")).toHaveAttribute("data-name", "현재 대상");

    act(() => {
      testState.capturedLogUpdated?.(testState.updated);
    });
    rerender(<DesktopHistoryView />);

    await waitFor(() => {
      expect(screen.getByTestId("history-right-panel-state")).toHaveAttribute("data-name", "현재 대상");
      expect(testState.historyResult.groups.flatMap((group: any) => group.logs).find((log: TransactionLog) => log.log_id === first.log_id)?.cancelled).toBe(true);
    });
  });
});
