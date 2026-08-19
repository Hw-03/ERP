import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistoryFilterBar } from "../HistoryFilterBar";

function renderFilterBar(flatSurface?: boolean) {
  return render(
    <HistoryFilterBar
      search=""
      setSearch={vi.fn()}
      dateFilter="month"
      setDateFilter={vi.fn()}
      filterPanelOpen={false}
      onToggleFilterPanel={vi.fn()}
      activeFilterCount={0}
      calendarOpen={false}
      onToggleCalendar={vi.fn()}
      selectedDay={null}
      onClearSelectedDay={vi.fn()}
      selectedMonth={null}
      onClearSelectedMonth={vi.fn()}
      flatSurface={flatSurface}
    />,
  );
}

describe("HistoryFilterBar", () => {
  it("keeps the mobile-default card surface when flatSurface is omitted", () => {
    renderFilterBar();

    expect(screen.getByRole("textbox").closest("section")).toHaveClass("card");
    expect(screen.getByRole("textbox").closest("section")).not.toHaveClass("desktop-flat-surface");
  });

  it("applies the desktop flat surface when requested", () => {
    renderFilterBar(true);

    expect(screen.getByRole("textbox").closest("section")).toHaveClass("card", "desktop-flat-surface");
  });

  it("keeps the selected month visible and does not highlight a preset beneath it", () => {
    render(
      <HistoryFilterBar
        search=""
        setSearch={vi.fn()}
        dateFilter="MONTH"
        setDateFilter={vi.fn()}
        filterPanelOpen={false}
        onToggleFilterPanel={vi.fn()}
        activeFilterCount={0}
        calendarOpen={false}
        onToggleCalendar={vi.fn()}
        selectedDay={null}
        onClearSelectedDay={vi.fn()}
        selectedMonth={{ year: 2026, month: 7 }}
        onClearSelectedMonth={vi.fn()}
      />,
    );

    expect(screen.getByText("선택: 2026년 8월")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "선택 월 해제" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이번달" })).toHaveStyle({ color: "var(--c-muted2)" });
  });
});
