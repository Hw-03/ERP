import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DefectFilterBar } from "../DefectFilterBar";

describe("DefectFilterBar", () => {
  const baseProps = {
    scope: "my" as const,
    actorScope: "all" as const,
    sort: "newest" as const,
    filterLocked: false,
    onScopeChange: vi.fn(),
    onActorScopeChange: vi.fn(),
    onSortChange: vi.fn(),
    onFilterLockedChange: vi.fn(),
    currentDept: "조립",
  };

  it("renders an accessible 44px search field with a clear button and wrapping layout", () => {
    const setSearch = vi.fn();
    const { rerender } = render(<DefectFilterBar {...baseProps} search=" memo " setSearch={setSearch} />);

    const input = screen.getByRole("searchbox", { name: "불량 검색" });
    expect(input).toHaveClass("min-h-11");
    expect(input.parentElement).toHaveClass("focus-within:ring-2");
    expect(input).toHaveAttribute("placeholder", "품명 · 코드 · 부서 · 사유 · 처리자");
    expect(input.parentElement).toHaveClass("flex-1");
    expect(input.parentElement).toHaveClass("min-h-11", "min-w-[240px]", "w-full", "lg:w-auto");
    expect(screen.getByRole("button", { name: "불량 검색 지우기" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "불량 검색 지우기" }));
    expect(setSearch).toHaveBeenCalledWith("");

    rerender(<DefectFilterBar {...baseProps} search="" setSearch={setSearch} />);
    expect(screen.queryByRole("button", { name: "불량 검색 지우기" })).not.toBeInTheDocument();
  });

  it("places the search field after all existing filter controls in DOM focus order", () => {
    const { container } = render(<DefectFilterBar {...baseProps} search="" setSearch={vi.fn()} />);
    const focusables = Array.from(container.querySelectorAll<HTMLElement>("button, select, input"))
      .filter((element) => !element.hasAttribute("disabled") && element.tabIndex >= 0);
    const search = screen.getByRole("searchbox", { name: "불량 검색" });

    expect(focusables.at(-1)).toBe(search);
    expect(focusables.slice(0, -1)).not.toContain(search);
  });

  it("renders the filter lock checkbox after the sort select and reports changes", () => {
    const onFilterLockedChange = vi.fn();
    const { rerender } = render(
      <DefectFilterBar
        scope="my"
        actorScope="all"
        sort="newest"
        filterLocked={false}
        onScopeChange={vi.fn()}
        onActorScopeChange={vi.fn()}
        onSortChange={vi.fn()}
        onFilterLockedChange={onFilterLockedChange}
        currentDept="조립"
        search=""
        setSearch={vi.fn()}
      />,
    );

    const sortSelect = screen.getByRole("combobox");
    const checkbox = screen.getByRole("checkbox", { name: "필터 고정" });
    expect(sortSelect.compareDocumentPosition(checkbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(onFilterLockedChange).toHaveBeenCalledWith(true);

    rerender(
      <DefectFilterBar
        scope="my"
        actorScope="all"
        sort="newest"
        filterLocked
        onScopeChange={vi.fn()}
        onActorScopeChange={vi.fn()}
        onSortChange={vi.fn()}
        onFilterLockedChange={onFilterLockedChange}
        currentDept="조립"
        search=""
        setSearch={vi.fn()}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "필터 고정" })).toBeChecked();
  });
});
