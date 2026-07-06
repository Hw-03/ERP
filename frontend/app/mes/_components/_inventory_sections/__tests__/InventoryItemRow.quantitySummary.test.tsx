import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/api";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

vi.mock("@/app/mes/_components/DepartmentsContext", () => ({
  useDeptColorLookup: () => () => "var(--c-blue)",
}));

import { InventoryItemRow } from "../InventoryItemRow";
import { InventoryItemsTable } from "../InventoryItemsTable";

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    item_id: "item-1",
    item_name: "테스트 품목",
    mes_code: "3-TR-0001",
    spec: null,
    unit: "EA",
    quantity: 15,
    warehouse_qty: 5,
    min_stock: null,
    department: "조립",
    process_type: null,
    image_filename: null,
    locations: [
      { department: "조립", status: "PRODUCTION", quantity: 8 },
      { department: "조립", status: "DEFECTIVE", quantity: 2 },
    ],
    ...overrides,
  } as unknown as Item;
}

describe("InventoryItemRow quantity summary", () => {
  it("shows warehouse, each production department, and defective total as stock chips while keeping the gauge", () => {
    render(
      <table>
        <tbody>
          <InventoryItemRow item={makeItem()} selected={false} onSelect={() => {}} />
        </tbody>
      </table>,
    );

    const summary = screen.getByTestId("inventory-dept-stock-summary");
    expect(within(summary).getByText("창고 5")).toBeInTheDocument();
    expect(within(summary).getByText("조립 8")).toBeInTheDocument();
    expect(within(summary).getByText("불량 2")).toBeInTheDocument();
    expect(screen.getByTestId("inventory-total-stock")).toHaveTextContent("15");
    expect(screen.getByRole("img", { name: /재고 분포/ })).toBeInTheDocument();
  });

  it("hides the defective stock chip when defective quantity is zero", () => {
    render(
      <table>
        <tbody>
          <InventoryItemRow
            item={makeItem({
              quantity: 13,
              warehouse_qty: 5,
              locations: [{ department: "조립", status: "PRODUCTION", quantity: 8 }],
            })}
            selected={false}
            onSelect={() => {}}
          />
        </tbody>
      </table>,
    );

    const summary = screen.getByTestId("inventory-dept-stock-summary");
    expect(within(summary).getByText("창고 5")).toBeInTheDocument();
    expect(within(summary).getByText("조립 8")).toBeInTheDocument();
    expect(within(summary).queryByText(/불량/)).toBeNull();
  });

  it("renames inventory table headers to department stock and total stock", () => {
    render(
      <InventoryItemsTable
        error={null}
        loading={false}
        filteredItems={[makeItem()]}
        displayLimit={100}
        setDisplayLimit={() => {}}
        selectedItem={null}
        onSelectItem={() => {}}
        activeFilterCount={0}
        hasKpiFilter={false}
        onRetry={() => {}}
        onResetAllFilters={() => {}}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "부서별 재고" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "총재고" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "부서" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "현재고" })).toBeNull();
  });

  it("uses compact dashboard columns with total stock aligned to its values", () => {
    render(
      <InventoryItemsTable
        error={null}
        loading={false}
        filteredItems={[makeItem()]}
        displayLimit={100}
        setDisplayLimit={() => {}}
        selectedItem={null}
        onSelectItem={() => {}}
        activeFilterCount={0}
        hasKpiFilter={false}
        onRetry={() => {}}
        onResetAllFilters={() => {}}
        compact
      />,
    );

    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "상태",
      "품목명",
      "총재고",
    ]);
    expect(screen.queryByText("3-TR-0001")).toBeNull();
    expect(screen.getByRole("columnheader", { name: "총재고" })).toHaveClass("text-center");
    expect(screen.getByTestId("inventory-total-stock")).toHaveClass("text-center");
  });
});
