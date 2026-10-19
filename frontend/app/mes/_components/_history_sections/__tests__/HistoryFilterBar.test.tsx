import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistoryFilterBar } from "../HistoryFilterBar";

function renderFilterBar(flatSurface?: boolean, mobile?: boolean) {
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
      mobile={mobile}
    />,
  );
}

describe("HistoryFilterBar", () => {
  it.each([false, true])("updates search during IME composition and on completion (mobile: %s)", (mobile) => {
    const setSearch = vi.fn();
    render(<HistoryFilterBar search="" setSearch={setSearch} dateFilter="MONTH" setDateFilter={vi.fn()}
      filterPanelOpen={false} onToggleFilterPanel={vi.fn()} activeFilterCount={0}
      calendarOpen={false} onToggleCalendar={vi.fn()} selectedDay={null} onClearSelectedDay={vi.fn()}
      selectedMonth={null} onClearSelectedMonth={vi.fn()} mobile={mobile} />);
    const input = screen.getByRole("textbox");
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "작" } });
    expect(setSearch).toHaveBeenLastCalledWith("작");
    expect(input).toHaveValue("작");
    fireEvent.compositionEnd(input, { data: "작업", target: { value: "작업" } });
    expect(setSearch).toHaveBeenLastCalledWith("작업");
  });

  it.each([false, true])("places a pressed mine toggle between period and filter controls (mobile: %s)", (mobile) => {
    const onToggleMine = vi.fn();
    render(<HistoryFilterBar search="" setSearch={vi.fn()} dateFilter="MONTH" setDateFilter={vi.fn()}
      filterPanelOpen={false} onToggleFilterPanel={vi.fn()} activeFilterCount={0}
      calendarOpen={false} onToggleCalendar={vi.fn()} selectedDay={null} onClearSelectedDay={vi.fn()}
      selectedMonth={null} onClearSelectedMonth={vi.fn()} mobile={mobile} mineOnly onToggleMine={onToggleMine} />);
    const mine = screen.getByRole("button", { name: "내 내역", pressed: true });
    expect(screen.getByRole("button", { name: "전체" }).compareDocumentPosition(mine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(mine.compareDocumentPosition(screen.getByRole("button", { name: "필터" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(mine).toHaveClass("min-h-11", "min-w-11");
    if (!mobile) expect(mine).toHaveClass("lg:min-h-0");
    expect(mine).toHaveStyle({ color: "var(--c-blue)", borderColor: "var(--c-blue)" });
    fireEvent.click(mine);
    expect(onToggleMine).toHaveBeenCalledOnce();
  });

  it("shows mine unpressed by default", () => {
    renderFilterBar();
    expect(screen.getByRole("button", { name: "내 내역", pressed: false })).toBeInTheDocument();
  });

  it("places mobile period controls before the search and sticks only the search", () => {
    const { container } = renderFilterBar(false, true);
    const search = screen.getByRole("textbox");
    const filter = screen.getByRole("button", { name: "필터" });
    const calendar = screen.getByRole("button", { name: "달력" });
    const period = screen.getByRole("button", { name: "이번달" });

    for (const control of [period, filter, calendar]) {
      expect(control.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(control.closest(".sticky")).toBeNull();
    }
    const stickySearch = search.closest(".sticky");
    expect(stickySearch).toHaveClass("top-0");
    expect(stickySearch?.parentElement).toBe(container);
  });

  it("keeps desktop search before period controls without sticky positioning", () => {
    renderFilterBar(true);
    const search = screen.getByRole("textbox");
    const period = screen.getByRole("button", { name: "이번달" });

    expect(search.compareDocumentPosition(period) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(search.closest(".sticky")).toBeNull();
  });

  it("describes visible operation labels as a search target", () => {
    renderFilterBar();

    expect(screen.getByPlaceholderText("작업 · 품명 · 코드 · 담당자 · 메모")).toBeInTheDocument();
  });

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
