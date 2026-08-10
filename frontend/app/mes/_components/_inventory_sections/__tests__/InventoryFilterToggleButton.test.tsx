import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InventoryFilterToggleButton } from "../InventoryFilterToggleButton";

describe("InventoryFilterToggleButton", () => {
  it("필터가 열렸을 때 OR 기본 토글을 표시하고 AND 선택을 전달한다", () => {
    const onLogicChange = vi.fn();

    render(
      <InventoryFilterToggleButton
        filtersOpen
        logic="OR"
        onLogicChange={onLogicChange}
        onToggle={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "OR" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "AND" })).toHaveAttribute("aria-pressed", "false");

    const filterButton = screen.getByRole("button", { name: "필터" });
    const andButton = screen.getByRole("button", { name: "AND" });
    expect(filterButton).toHaveClass("h-full");
    expect(filterButton.parentElement).toHaveClass("self-stretch");
    expect(andButton.parentElement).toHaveClass("h-full");
    expect(andButton).toHaveClass("h-full");
    expect(filterButton.compareDocumentPosition(andButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "AND" }));

    expect(onLogicChange).toHaveBeenCalledWith("AND");
  });

  it("필터가 닫혀 있으면 논리 토글을 표시하지 않는다", () => {
    const { rerender } = render(
      <InventoryFilterToggleButton
        filtersOpen={false}
        logic="OR"
        onLogicChange={() => {}}
        onToggle={() => {}}
      />,
    );

    expect(screen.queryByRole("button", { name: "OR" })).not.toBeInTheDocument();
    const closedTransition = screen
      .getByRole("button", { name: "OR", hidden: true })
      .closest(".ift");
    expect(closedTransition).toHaveAttribute("aria-hidden", "true");
    expect(closedTransition).not.toHaveClass("is-open");

    rerender(
      <InventoryFilterToggleButton
        filtersOpen
        logic="OR"
        onLogicChange={() => {}}
        onToggle={() => {}}
      />,
    );

    const openTransition = screen
      .getByRole("button", { name: "OR" })
      .closest(".ift");
    expect(openTransition).toHaveAttribute("aria-hidden", "false");
    expect(openTransition).toHaveClass("is-open");
  });
});
