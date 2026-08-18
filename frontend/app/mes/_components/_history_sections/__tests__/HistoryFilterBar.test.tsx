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
});
