import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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
vi.mock("../_history_sections/HistoryFilterBar", () => ({
  HistoryFilterBar: ({ flatSurface }: { flatSurface?: boolean }) => (
    <div data-testid="history-filter-bar" data-flat-surface={flatSurface ? "true" : "false"} />
  ),
}));
vi.mock("../_history_sections/HistoryFilterPanel", () => ({ HistoryFilterPanel: () => <div /> }));
vi.mock("../_history_sections/HistoryCalendarPanel", () => ({ HistoryCalendarPanel: () => <div /> }));
vi.mock("../_history_sections/HistoryTable", () => ({ HistoryTable: () => <div data-testid="history-table" /> }));
vi.mock("../_history_sections/DesktopHistoryRightPanel", () => ({ DesktopHistoryRightPanel: () => <div /> }));

describe("DesktopHistoryView scrollbar", () => {
  it("keeps the full transaction workspace in one visible outer scrollbar", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}><DesktopHistoryView /></QueryClientProvider>,
    );

    const viewport = screen.getByTestId("history-left-viewport");
    const scroller = screen.getByTestId("history-left-content");
    const historyTable = screen.getByTestId("history-table");
    expect(scroller).toHaveClass("sg", "min-h-0", "flex-1", "overflow-y-auto");
    expect(scroller).not.toHaveClass("scrollbar-hide");
    expect(viewport).toHaveClass("min-h-0", "flex", "flex-1", "flex-col", "overflow-hidden", "rounded-[32px]");
    expect(viewport).not.toHaveClass("border");
    expect(viewport).not.toHaveStyle({ background: "var(--c-s1)", borderColor: "var(--c-border)" });
    expect(viewport).not.toHaveClass("overflow-y-auto");
    expect(screen.queryByTestId("history-controls")).not.toBeInTheDocument();
    expect(screen.queryByTestId("history-list-card")).not.toBeInTheDocument();
    expect(historyTable.parentElement).toHaveClass("flex", "flex-col", "gap-2");
    expect(screen.getByTestId("history-filter-bar")).toHaveAttribute("data-flat-surface", "true");
    expect(scroller).not.toHaveClass("rounded-[28px]", "desktop-flat-surface", "border");
    expect(scroller).not.toHaveStyle({ background: "var(--c-s1)" });
  });
});
