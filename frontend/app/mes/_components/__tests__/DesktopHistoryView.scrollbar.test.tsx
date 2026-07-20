import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DesktopHistoryView } from "../DesktopHistoryView";

vi.mock("@/lib/queries/useModelsQuery", () => ({ useModelsQuery: () => ({ data: [] }) }));
vi.mock("@/lib/api/production", () => ({
  productionApi: { getTransactionsSummary: () => new Promise(() => {}) },
}));
vi.mock("@/lib/queries/useTransactionsQuery", () => ({
  useMonthlyCountsQuery: () => ({ data: {} }),
  useTransactionsSummaryQuery: () => ({ data: null, isLoading: false, refetch: vi.fn() }),
  useTransactionReferenceSummariesQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock("../_hooks/useDesktopHistoryGroups", () => ({
  useDesktopHistoryGroups: () => ({
    groups: [], setGroups: vi.fn(), loading: false, error: null, retry: vi.fn(),
    loadingMore: false, loadMoreError: null, canLoadMore: false, loadMore: vi.fn(),
  }),
}));
vi.mock("../_hooks/useToggleSet", () => ({
  useToggleSet: () => ({ selected: [], toggle: vi.fn(), setSelected: vi.fn() }),
}));
vi.mock("../_history_sections/HistoryStatsBar", () => ({ HistoryStatsBar: () => <div /> }));
vi.mock("../_history_sections/HistoryFilterBar", () => ({ HistoryFilterBar: () => <div /> }));
vi.mock("../_history_sections/HistoryFilterPanel", () => ({ HistoryFilterPanel: () => <div /> }));
vi.mock("../_history_sections/HistoryCalendarPanel", () => ({ HistoryCalendarPanel: () => <div /> }));
vi.mock("../_history_sections/HistoryTable", () => ({ HistoryTable: () => <div /> }));
vi.mock("../_history_sections/DesktopHistoryRightPanel", () => ({ DesktopHistoryRightPanel: () => <div /> }));

describe("DesktopHistoryView scrollbar", () => {
  it("keeps the transaction list scrollbar visible and draggable", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={queryClient}><DesktopHistoryView /></QueryClientProvider>,
    );

    const scroller = container.querySelector(".overflow-y-auto");
    expect(scroller).toHaveClass("sg");
    expect(scroller).not.toHaveClass("scrollbar-hide");
  });
});
