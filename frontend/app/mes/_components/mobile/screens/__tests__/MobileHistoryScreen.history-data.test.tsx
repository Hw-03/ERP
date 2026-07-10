import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionLog } from "@/lib/api";
import type { TransactionSummary } from "@/lib/api/production";
import { MobileHistoryScreen } from "../MobileHistoryScreen";

type HistoryHookArgs = {
  totalCount?: number | null;
};

type HistoryResult = {
  logs: TransactionLog[];
  setLogs: React.Dispatch<React.SetStateAction<TransactionLog[]>>;
  loading: boolean;
  error: string | null;
  retry: ReturnType<typeof vi.fn>;
  loadingMore: boolean;
  loadMoreError: string | null;
  canLoadMore: boolean;
  loadMore: ReturnType<typeof vi.fn>;
};

type SummaryParams = {
  transactionTypes?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  department?: string;
  model?: string;
};

const testState = vi.hoisted(() => ({
  historyResult: null as HistoryResult | null,
  historyArgs: [] as HistoryHookArgs[],
  getTransactionsSummary: vi.fn(),
}));

vi.mock("../../../_hooks/useHistoryData", () => ({
  useHistoryData: (args: HistoryHookArgs) => {
    if (!testState.historyResult) throw new Error("history result is not configured");
    testState.historyArgs.push(args);
    const totalCount = args.totalCount;
    return {
      ...testState.historyResult,
      canLoadMore:
        !testState.historyResult.loading &&
        totalCount != null &&
        testState.historyResult.logs.length < totalCount,
    };
  },
}));

vi.mock("@/lib/api", () => ({
  api: {
    getTransactions: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/api/production", () => ({
  productionApi: {
    getTransactionsSummary: testState.getTransactionsSummary,
  },
}));

vi.mock("@/lib/queries/useModelsQuery", () => ({
  useModelsQuery: () => ({ data: [] }),
}));

vi.mock("@/lib/queries/useTransactionsQuery", () => ({
  useMonthlyCountsQuery: () => ({ data: {} }),
}));

vi.mock("@/lib/ui/BottomSheet", () => ({
  BottomSheet: () => null,
}));

vi.mock("../../../_history_sections/HistoryStatsBar", () => ({
  HistoryStatsBar: ({
    currentCount,
    loading,
  }: {
    currentCount: number | null;
    loading: boolean;
  }) => (
    <output data-testid="history-kpi" data-loading={loading ? "yes" : "no"}>
      {currentCount ?? "null"}
    </output>
  ),
}));

vi.mock("../../../_history_sections/HistoryFilterBar", () => ({
  HistoryFilterBar: ({
    search,
    setSearch,
    onToggleFilterPanel,
  }: {
    search: string;
    setSearch: (value: string) => void;
    onToggleFilterPanel: () => void;
  }) => (
    <div>
      <input
        aria-label="history search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <button type="button" onClick={onToggleFilterPanel}>
        filters
      </button>
    </div>
  ),
}));

vi.mock("../../../_history_sections/HistoryFilterPanel", () => ({
  HistoryFilterPanel: ({ toggleDept }: { toggleDept: (department: string) => void }) => (
    <div>
      <button type="button" onClick={() => toggleDept("검사")}>
        inspection department
      </button>
      <button type="button" onClick={() => toggleDept("조립|검사")}>
        delimited department
      </button>
    </div>
  ),
}));

vi.mock("../../../_history_sections/HistoryCalendarPanel", () => ({
  HistoryCalendarPanel: () => null,
}));

vi.mock("../../../_history_sections/HistoryDetailPanel", () => ({
  HistoryDetailPanel: () => null,
}));

vi.mock("../../../_history_sections/HistoryBatchDetailPanel", () => ({
  HistoryBatchDetailPanel: () => null,
}));

vi.mock("../../history/MobileHistoryList", () => ({
  MobileHistoryList: ({
    error,
    filteredLogs,
    onRetry,
    canLoadMore,
  }: {
    error: string | null;
    filteredLogs: TransactionLog[];
    onRetry: () => void;
    canLoadMore: boolean;
  }) => (
    <div data-testid="mobile-history-list" data-error={error ?? "none"}>
      {error && filteredLogs.length === 0 ? (
        <button type="button" onClick={onRetry}>
          retry transactions
        </button>
      ) : null}
      {canLoadMore ? <button type="button">더 보기</button> : null}
    </div>
  ),
}));

function makeSummary(total: number): TransactionSummary {
  return {
    total,
    warehouseCount: total,
    deptCount: 0,
    adjustCount: 0,
    departmentCounts: {},
  };
}

function makeLogs(count: number): TransactionLog[] {
  return Array.from({ length: count }, (_, index) => ({
    log_id: `log-${index}`,
  })) as TransactionLog[];
}

function isCurrentSummary(params: SummaryParams): boolean {
  return Object.prototype.hasOwnProperty.call(params, "transactionTypes");
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
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
  testState.historyArgs.length = 0;
  testState.getTransactionsSummary.mockReset();
  testState.historyResult = {
    logs: [],
    setLogs: vi.fn(),
    loading: false,
    error: null,
    retry: vi.fn(),
    loadingMore: false,
    loadMoreError: null,
    canLoadMore: false,
    loadMore: vi.fn(),
  };
  testState.getTransactionsSummary.mockResolvedValue(makeSummary(0));
});

describe("MobileHistoryScreen history data states", () => {
  it("wires the initial transaction error and retry action to the mobile list", async () => {
    const retry = vi.fn();
    testState.historyResult = {
      ...testState.historyResult!,
      error: "transactions unavailable",
      retry,
    };

    renderScreen();

    await waitFor(() =>
      expect(screen.getByTestId("mobile-history-list")).toHaveAttribute(
        "data-error",
        "transactions unavailable",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "retry transactions" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("clears a stale KPI as soon as conditions change and keeps it clear after failure", async () => {
    const nextSummary = deferred<TransactionSummary>();
    testState.getTransactionsSummary.mockImplementation((params: SummaryParams) => {
      if (!isCurrentSummary(params)) return Promise.resolve(makeSummary(90));
      if (params.search === "B") return nextSummary.promise;
      return Promise.resolve(makeSummary(37));
    });

    renderScreen();
    await waitFor(() => expect(screen.getByTestId("history-kpi")).toHaveTextContent("37"));

    fireEvent.change(screen.getByRole("textbox", { name: "history search" }), {
      target: { value: "B" },
    });
    await waitFor(() =>
      expect(testState.getTransactionsSummary).toHaveBeenCalledWith(
        expect.objectContaining({ search: "B" }),
        expect.anything(),
      ),
    );

    expect(screen.getByTestId("history-kpi")).toHaveTextContent("null");
    expect(screen.getByTestId("history-kpi")).toHaveAttribute("data-loading", "yes");

    await act(async () => {
      nextSummary.reject(new Error("summary unavailable"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("history-kpi")).toHaveAttribute("data-loading", "no"),
    );
    expect(screen.getByTestId("history-kpi")).toHaveTextContent("null");
  });

  it("rejects a stale response when delimiter-containing filters share the old joined key", async () => {
    const first = deferred<TransactionSummary>();
    const second = deferred<TransactionSummary>();
    testState.getTransactionsSummary.mockImplementation((params: SummaryParams) => {
      if (!isCurrentSummary(params)) return Promise.resolve(makeSummary(90));
      if (params.search === "AX|조립" && params.department === "검사") return first.promise;
      if (params.search === "AX" && params.department === "조립|검사") return second.promise;
      return Promise.resolve(makeSummary(0));
    });

    renderScreen();
    await waitFor(() => expect(screen.getByTestId("history-kpi")).toHaveTextContent("0"));

    const search = screen.getByRole("textbox", { name: "history search" });
    fireEvent.change(search, { target: { value: "AX|조립" } });
    await waitFor(() =>
      expect(testState.getTransactionsSummary).toHaveBeenCalledWith(
        expect.objectContaining({ search: "AX|조립", department: undefined }),
        expect.anything(),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "filters" }));
    fireEvent.click(screen.getByRole("button", { name: "inspection department" }));
    await waitFor(() =>
      expect(testState.getTransactionsSummary).toHaveBeenCalledWith(
        expect.objectContaining({ search: "AX|조립", department: "검사" }),
        expect.anything(),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "inspection department" }));
    fireEvent.click(screen.getByRole("button", { name: "delimited department" }));
    fireEvent.change(search, { target: { value: "AX" } });
    await waitFor(() =>
      expect(testState.getTransactionsSummary).toHaveBeenCalledWith(
        expect.objectContaining({ search: "AX", department: "조립|검사" }),
        expect.anything(),
      ),
    );

    await act(async () => {
      second.resolve(makeSummary(222));
    });
    await waitFor(() => expect(screen.getByTestId("history-kpi")).toHaveTextContent("222"));

    await act(async () => {
      first.resolve(makeSummary(111));
    });
    expect(screen.getByTestId("history-kpi")).toHaveTextContent("222");
  });

  it.each([
    { loaded: 100, total: 100, visible: false },
    { loaded: 100, total: 101, visible: true },
    { loaded: 200, total: 200, visible: false },
    { loaded: 200, total: 201, visible: true },
  ])(
    "passes total=$total for $loaded loaded rows and sets load-more visibility to $visible",
    async ({ loaded, total, visible }) => {
      testState.historyResult = {
        ...testState.historyResult!,
        logs: makeLogs(loaded),
      };
      testState.getTransactionsSummary.mockImplementation((params: SummaryParams) =>
        Promise.resolve(makeSummary(isCurrentSummary(params) ? total : 999)),
      );

      renderScreen();

      await waitFor(() =>
        expect(testState.historyArgs.at(-1)?.totalCount).toBe(total),
      );
      expect(screen.queryByRole("button", { name: "더 보기" }) !== null).toBe(visible);
    },
  );
});
