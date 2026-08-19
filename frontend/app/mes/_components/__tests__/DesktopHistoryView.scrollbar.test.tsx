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
  it("keeps the full transaction workspace inside a rounded surface beside the outer scrollbar", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}><DesktopHistoryView /></QueryClientProvider>,
    );

    const viewport = screen.getByTestId("history-left-viewport");
    const scroller = screen.getByTestId("history-left-content");
    const historyTable = screen.getByTestId("history-table");

    expect(scroller).toHaveClass(
      "sg",
      "min-h-0",
      "flex-1",
      "overflow-y-auto",
      "[scrollbar-gutter:stable]",
      "sm:block",
      "sm:overflow-y-scroll",
    );
    expect(scroller).not.toHaveClass("scrollbar-hide");
    expect(viewport).toHaveClass("relative", "min-h-0", "flex", "flex-1", "flex-col");
    expect(viewport).not.toHaveClass("rounded-[32px]");
    expect(viewport).not.toHaveClass("rounded-[24px]", "border", "overflow-hidden");
    expect(viewport).not.toHaveStyle({ background: "var(--c-s1)", borderColor: "var(--c-border)" });
    expect(viewport).not.toHaveClass("overflow-y-auto");
    expect(screen.queryByTestId("history-controls")).not.toBeInTheDocument();
    expect(screen.queryByTestId("history-list-work-area")).not.toBeInTheDocument();
    expect(screen.queryByTestId("history-list-card")).not.toBeInTheDocument();
    const surface = screen.getByTestId("history-scroll-surface");
    expect(surface).toHaveClass("min-h-full");
    expect(surface).not.toHaveClass("overflow-clip", "rounded-[24px]", "border");
    expect(surface).not.toHaveStyle({ background: "var(--c-s1)", borderColor: "var(--c-border)" });
    expect(historyTable.parentElement).toHaveClass("flex", "flex-col", "gap-2");
    expect(historyTable.parentElement?.parentElement).toBe(surface);
    const frame = screen.getByTestId("history-scroll-frame");
    expect(frame).toHaveClass("pointer-events-none", "absolute", "bottom-0", "left-0", "right-2.5", "z-30", "h-6");
    expect(frame).not.toHaveClass("sticky", "top-0", "-mb-full", "h-full");
    expect(frame.children).toHaveLength(2);
    expect(frame.children[0].getAttribute("style")).toContain("var(--c-bg)");
    expect(frame.children[1].getAttribute("style")).toContain("var(--c-bg)");
    expect(screen.getByTestId("history-filter-bar")).toHaveAttribute("data-flat-surface", "true");
    expect(scroller).not.toHaveClass("rounded-[28px]");
    expect(scroller).not.toHaveClass("desktop-flat-surface");
    expect(scroller).not.toHaveClass("border");
    expect(scroller).not.toHaveStyle({ background: "var(--c-s1)" });
  });
});
