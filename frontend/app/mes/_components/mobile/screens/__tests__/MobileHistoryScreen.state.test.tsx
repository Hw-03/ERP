import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { TransactionLog } from "@/lib/api";
import type { IoBatch } from "@/lib/api/types/io";
import { queryKeys } from "@/lib/queries/keys";
import { MobileHistoryScreen } from "../MobileHistoryScreen";

const testState = vi.hoisted(() => ({
  historyResult: null as any,
  batch: null as any,
  updated: null as any,
  drillTarget: null as any,
  capturedLogUpdated: null as null | ((updated: TransactionLog) => void),
  queryClient: null as QueryClient | null,
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: () => testState.queryClient,
  };
});

vi.mock("../../../_hooks/useHistoryData", () => ({
  useHistoryData: () => testState.historyResult,
}));

vi.mock("@/lib/api", () => ({
  api: {
    getTransactions: vi.fn(),
  },
}));

vi.mock("@/lib/api/production", () => ({
  productionApi: {
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
  BottomSheet: ({ open, children }: any) => (
    <div data-testid="mobile-history-sheet" data-open={open ? "yes" : "no"}>
      {children}
    </div>
  ),
}));

vi.mock("../../../_history_sections/HistoryStatsBar", () => ({ HistoryStatsBar: () => null }));
vi.mock("../../../_history_sections/HistoryFilterBar", () => ({ HistoryFilterBar: () => null }));
vi.mock("../../../_history_sections/HistoryFilterPanel", () => ({ HistoryFilterPanel: () => null }));
vi.mock("../../../_history_sections/HistoryCalendarPanel", () => ({ HistoryCalendarPanel: () => null }));

vi.mock("../../history/MobileHistoryList", () => ({
  MobileHistoryList: ({ filteredLogs, selectedKey, onSelectLog, onSelectBatch }: any) => (
    <div
      data-testid="mobile-history-list-state"
      data-selection={selectedKey ?? "none"}
      data-list-cancelled={filteredLogs.length > 0 && filteredLogs.every((log: TransactionLog) => log.cancelled) ? "yes" : "no"}
    >
      <button type="button" onClick={() => filteredLogs[0] && onSelectLog(filteredLogs[0])}>
        모바일 단건 선택
      </button>
      <button type="button" onClick={() => onSelectBatch("batch-1", filteredLogs)}>
        모바일 묶음 선택
      </button>
      <button
        type="button"
        onClick={() => {
          const referenceLogs = filteredLogs.filter((log: TransactionLog) => !log.operation_batch_id && log.reference_no);
          const first = referenceLogs[0];
          if (first) onSelectBatch(`${first.reference_no}::${first.shipping_phase ?? ""}`, referenceLogs);
        }}
      >
        모바일 참조 묶음 선택
      </button>
    </div>
  ),
}));

vi.mock("../../../_history_sections/HistoryDetailPanel", () => ({
  HistoryDetailPanel: ({ selected, panelOpen, onSelectLog, onLogUpdated }: any) => (
    <div
      data-testid="mobile-log-detail-state"
      data-name={selected.item_name}
      data-panel-open={panelOpen ? "yes" : "no"}
    >
      {testState.drillTarget && (
        <button type="button" onClick={() => onSelectLog(testState.drillTarget)}>모바일 드릴 이동</button>
      )}
      <button type="button" onClick={() => { testState.capturedLogUpdated = onLogUpdated; }}>
        모바일 취소 콜백 보관
      </button>
    </div>
  ),
}));

vi.mock("../../../_history_sections/HistoryBatchDetailPanel", () => ({
  HistoryBatchDetailPanel: ({
    batchId,
    logs,
    batchCache,
    setBatchCache,
    onBatchCancelled,
    panelOpen,
  }: any) => (
    <div
      data-testid="mobile-batch-detail-state"
      data-panel-open={panelOpen ? "yes" : "no"}
      data-name={logs[0]?.item_name ?? ""}
      data-selection-cancelled={logs.every((log: TransactionLog) => log.cancelled) ? "yes" : "no"}
      data-cache-status={batchCache.get(batchId)?.status ?? "missing"}
    >
      <button
        type="button"
        onClick={() => setBatchCache(new Map([[batchId, testState.batch]]))}
      >
        모바일 배치 캐시 준비
      </button>
      <button
        type="button"
        onClick={() => onBatchCancelled(batchId, testState.updated)}
      >
        모바일 묶음 취소 성공
      </button>
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
    logs,
    loading,
    error,
    retry: vi.fn(),
    loadingMore: false,
    loadMoreError: null,
    canLoadMore: false,
    loadMore: vi.fn(),
    setLogs: (update: React.SetStateAction<TransactionLog[]>) => {
      const next = typeof update === "function" ? update(testState.historyResult.logs) : update;
      testState.historyResult = { ...testState.historyResult, logs: next };
    },
  };
}

beforeEach(() => {
  testState.queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  testState.batch = makeBatch();
  testState.drillTarget = null;
  testState.capturedLogUpdated = null;
  testState.updated = makeLog({
    cancelled: true,
    cancel_reason: "입력 오류",
    cancelled_by: "employee-1",
    cancelled_at: "2026-07-10T02:00:00Z",
  });
  setHistoryResult([makeLog()], false);
});

describe("MobileHistoryScreen history state", () => {
  it("keeps selection for failed loads and refreshes or closes it after successful loads", async () => {
    const { rerender } = render(<MobileHistoryScreen />);
    fireEvent.click(screen.getByRole("button", { name: "모바일 단건 선택" }));
    expect(screen.getByTestId("mobile-log-detail-state")).toHaveAttribute("data-name", "이전 객체");
    expect(screen.getByTestId("mobile-log-detail-state")).toHaveAttribute("data-panel-open", "yes");

    const failedLogs: TransactionLog[] = [];
    setHistoryResult(failedLogs, true);
    rerender(<MobileHistoryScreen />);
    setHistoryResult(failedLogs, false, "조회 실패");
    rerender(<MobileHistoryScreen />);
    expect(screen.getByTestId("mobile-log-detail-state")).toHaveAttribute("data-name", "이전 객체");

    setHistoryResult([], true);
    rerender(<MobileHistoryScreen />);
    setHistoryResult([makeLog({ item_name: "최신 객체" })], false);
    rerender(<MobileHistoryScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("mobile-log-detail-state")).toHaveAttribute("data-name", "최신 객체");
    });

    setHistoryResult([], true);
    rerender(<MobileHistoryScreen />);
    setHistoryResult([], false);
    rerender(<MobileHistoryScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("mobile-history-sheet")).toHaveAttribute("data-open", "no");
      expect(screen.getByTestId("mobile-history-list-state")).toHaveAttribute("data-selection", "none");
    });
  });

  it("uses the shared cancellation patch for logs, selected batch, and cache", async () => {
    const transactionListKey = queryKeys.transactions.list({ screen: "mobile-history" });
    testState.queryClient?.setQueryData(transactionListKey, [makeLog()]);
    setHistoryResult([makeLog(), makeLog({ log_id: "log-2", item_id: "item-2" })], false);
    const { rerender } = render(<MobileHistoryScreen />);
    fireEvent.click(screen.getByRole("button", { name: "모바일 묶음 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "모바일 배치 캐시 준비" }));
    await waitFor(() => {
      expect(screen.getByTestId("mobile-batch-detail-state")).toHaveAttribute("data-cache-status", "completed");
    });
    fireEvent.click(screen.getByRole("button", { name: "모바일 묶음 취소 성공" }));
    rerender(<MobileHistoryScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("mobile-history-list-state")).toHaveAttribute("data-list-cancelled", "yes");
      expect(screen.getByTestId("mobile-batch-detail-state")).toHaveAttribute("data-selection-cancelled", "yes");
      expect(screen.getByTestId("mobile-batch-detail-state")).toHaveAttribute("data-cache-status", "cancelled");
      expect(testState.queryClient?.getQueryState(transactionListKey)?.isInvalidated).toBe(true);
    });
  });

  it("keeps a surviving reference batch open and replaces its logs after a successful query", async () => {
    const referenceNo = "defect-disassemble:rework-1";
    const oldLogs = [
      makeLog({
        operation_batch_id: null,
        reference_no: referenceNo,
        shipping_phase: "component",
        item_name: "이전 참조 객체",
      }),
      makeLog({
        log_id: "log-2",
        item_id: "item-2",
        operation_batch_id: null,
        reference_no: referenceNo,
        shipping_phase: "component",
      }),
    ];
    setHistoryResult(oldLogs, false);
    const { rerender } = render(<MobileHistoryScreen />);
    fireEvent.click(screen.getByRole("button", { name: "모바일 참조 묶음 선택" }));
    expect(screen.getByTestId("mobile-batch-detail-state")).toHaveAttribute("data-name", "이전 참조 객체");

    setHistoryResult(oldLogs, true);
    rerender(<MobileHistoryScreen />);
    const freshLogs = oldLogs.map((log, index) => ({
      ...log,
      item_name: index === 0 ? "최신 참조 객체" : log.item_name,
    }));
    setHistoryResult(freshLogs, false);
    rerender(<MobileHistoryScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("mobile-history-sheet")).toHaveAttribute("data-open", "yes");
      expect(screen.getByTestId("mobile-batch-detail-state")).toHaveAttribute("data-name", "최신 참조 객체");
      expect(screen.getByTestId("mobile-history-list-state")).toHaveAttribute(
        "data-selection",
        `batch:${referenceNo}::component`,
      );
    });
  });

  it("keeps the current mobile selection when an older cancellation callback resolves", async () => {
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
    const { rerender } = render(<MobileHistoryScreen />);

    fireEvent.click(screen.getByRole("button", { name: "모바일 단건 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "모바일 취소 콜백 보관" }));
    fireEvent.click(screen.getByRole("button", { name: "모바일 드릴 이동" }));
    expect(screen.getByTestId("mobile-log-detail-state")).toHaveAttribute("data-name", "현재 대상");

    act(() => {
      testState.capturedLogUpdated?.(testState.updated);
    });
    rerender(<MobileHistoryScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("mobile-log-detail-state")).toHaveAttribute("data-name", "현재 대상");
      expect(testState.historyResult.logs.find((log: TransactionLog) => log.log_id === first.log_id)?.cancelled).toBe(true);
    });
  });
});
