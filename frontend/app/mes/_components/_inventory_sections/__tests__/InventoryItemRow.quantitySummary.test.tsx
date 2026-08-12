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

  it("shows a positive pending reservation between warehouse and department chips without changing stock totals or gauge", () => {
    render(
      <table>
        <tbody>
          <InventoryItemRow
            item={makeItem({ pending_quantity: 3 } as Partial<Item>)}
            selected={false}
            onSelect={() => {}}
          />
        </tbody>
      </table>,
    );

    const summary = screen.getByTestId("inventory-dept-stock-summary");
    const warehouseChip = within(summary).getByText("창고 5");
    const pendingChip = within(summary).getByText("예약 3");
    const departmentChip = within(summary).getByText("조립 8");
    const defectiveChip = within(summary).getByText("불량 2");
    expect(warehouseChip.compareDocumentPosition(pendingChip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pendingChip.compareDocumentPosition(departmentChip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(departmentChip.compareDocumentPosition(defectiveChip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("inventory-total-stock")).toHaveTextContent("15");
    expect(defectiveChip).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /재고 분포/ })).toBeInTheDocument();
  });

  it("shows the combined warehouse and department approval pending quantity in the reservation chip", () => {
    render(
      <table>
        <tbody>
          <InventoryItemRow
            item={makeItem({ pending_quantity: 3, department_pending_quantity: 2 } as Partial<Item>)}
            selected={false}
            onSelect={() => {}}
          />
        </tbody>
      </table>,
    );

    expect(within(screen.getByTestId("inventory-dept-stock-summary")).getByText("예약 5")).toBeInTheDocument();
  });

  it("hides a zero pending reservation while keeping total, defective, and gauge displays", () => {
    render(
      <table>
        <tbody>
          <InventoryItemRow
            item={makeItem({ pending_quantity: 0 } as Partial<Item>)}
            selected={false}
            onSelect={() => {}}
          />
        </tbody>
      </table>,
    );

    const summary = screen.getByTestId("inventory-dept-stock-summary");
    expect(within(summary).queryByText(/예약/)).toBeNull();
    expect(screen.getByTestId("inventory-total-stock")).toHaveTextContent("15");
    expect(within(summary).getByText("불량 2")).toBeInTheDocument();
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

  it("hides zero-quantity warehouse stock while keeping positive stock chips", () => {
    render(
      <table>
        <tbody>
          <InventoryItemRow
            item={makeItem({ warehouse_qty: 0 })}
            selected={false}
            onSelect={() => {}}
          />
        </tbody>
      </table>,
    );

    const summary = screen.getByTestId("inventory-dept-stock-summary");
    expect(within(summary).queryByText("창고 0")).toBeNull();
    expect(within(summary).getByText("조립 8")).toBeInTheDocument();
    expect(within(summary).getByText("불량 2")).toBeInTheDocument();
  });

  it("shows a dash when no positive stock chips remain", () => {
    render(
      <table>
        <tbody>
          <InventoryItemRow
            item={makeItem({
              quantity: 0,
              warehouse_qty: 0,
              locations: [],
            })}
            selected={false}
            onSelect={() => {}}
          />
        </tbody>
      </table>,
    );

    const summary = screen.getByTestId("inventory-dept-stock-summary");
    expect(within(summary).getByText("-")).toBeInTheDocument();
    expect(summary.querySelectorAll("span")).toHaveLength(0);
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

  it("centers the dashboard item-code header and values", () => {
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

    expect(screen.getByRole("columnheader", { name: "품목 코드" })).toHaveClass("text-center");
    expect(screen.getByText("3-TR-0001").closest("td")).toHaveClass("text-center");
  });

  it("centers the dashboard status header and values", () => {
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

    expect(screen.getByRole("columnheader", { name: "상태" })).toHaveClass("text-center");
    expect(screen.getByText("정상").closest("td")).toHaveClass("text-center");
  });
});
