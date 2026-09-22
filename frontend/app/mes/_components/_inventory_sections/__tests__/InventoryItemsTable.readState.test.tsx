import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { InventoryItemsTable } from "../InventoryItemsTable";

it("keeps real inventory columns and full-height rows while loading", () => {
  render(<InventoryItemsTable error={null} loading filteredItems={[]} displayLimit={100}
    setDisplayLimit={vi.fn()} selectedItem={null} onSelectItem={vi.fn()} activeFilterCount={0}
    hasKpiFilter={false} onRetry={vi.fn()} onResetAllFilters={vi.fn()} />);
  expect(screen.getAllByRole("columnheader")).toHaveLength(7);
  expect(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
  expect(screen.getAllByTestId("inventory-skeleton-row")).toHaveLength(8);
  expect(screen.getAllByTestId("inventory-skeleton-row")[0].querySelectorAll("td")).toHaveLength(7);
});

it("uses the requested skeleton row count when reserving a tab-transition layout", () => {
  render(<InventoryItemsTable error={null} loading filteredItems={[]} displayLimit={100}
    setDisplayLimit={vi.fn()} selectedItem={null} onSelectItem={vi.fn()} activeFilterCount={0}
    hasKpiFilter={false} onRetry={vi.fn()} onResetAllFilters={vi.fn()} skeletonRowCount={20} />);

  expect(screen.getAllByTestId("inventory-skeleton-row")).toHaveLength(20);
});

it.each([[1, "검색 지우기"], [2, "필터 초기화"]])("distinguishes search from other active filters (%s)", (count, label) => {
  const reset = vi.fn();
  render(<InventoryItemsTable error={null} loading={false} filteredItems={[]} displayLimit={100}
    setDisplayLimit={vi.fn()} selectedItem={null} onSelectItem={vi.fn()} activeFilterCount={count}
    hasKpiFilter={false} hasSearch onRetry={vi.fn()} onResetAllFilters={reset} />);
  expect(screen.getByText("현재 조건에 맞는 자재가 없습니다")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: label }));
  expect(reset).toHaveBeenCalledOnce();
});
