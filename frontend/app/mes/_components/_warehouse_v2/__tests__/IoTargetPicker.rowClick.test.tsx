import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IoBundle, Item } from "../types";
import type { IoSubType, IoWorkType } from "@/lib/api";
import { IoTargetPicker } from "../IoTargetPicker";

vi.mock("../useItemOrderDrag", () => ({
  useItemOrderDrag: () => ({
    dragId: null,
    dropTargetId: null,
    makeHandlers: () => ({}),
  }),
}));

vi.mock("@/lib/queries/useMyItemOrderQuery", () => ({
  useMyItemOrderQuery: () => ({ data: null }),
  usePutMyItemOrderMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useResetMyItemOrderMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("../login/useCurrentOperator", () => ({
  useCurrentOperator: () => ({ employee_id: "emp-1", assigned_model_slots: [] }),
}));

function makeItem({ warehouseQty = 0, pendingQty = 0, locations = [] }: { warehouseQty?: number; pendingQty?: number; locations?: unknown[] } = {}): Item {
  return {
    item_id: "item-1",
    item_name: "Clickable Item",
    mes_code: "3-TR-0001",
    quantity: 0,
    warehouse_qty: warehouseQty,
    pending_quantity: pendingQty,
    min_stock: null,
    locations,
    model_slots: [],
    deleted_at: null,
  } as unknown as Item;
}

const baseProps = {
  workType: "receive" as const,
  subType: "receive_supplier" as const,
  deptIoDirection: null,
  bundleSubType: null,
  bomParents: new Set<string>(),
  items: [makeItem()],
  productModels: [],
  bundles: [],
  search: "",
  onSearchChange: vi.fn(),
  onAddItem: vi.fn(),
  onRemoveBundles: vi.fn(),
  onAdvance: vi.fn(),
};

function makeBundle(sourceKind: IoBundle["source_kind"]): IoBundle {
  return {
    bundle_id: `bundle-${sourceKind}`,
    source_kind: sourceKind,
    title: "Clickable Item",
    source_item_id: "item-1",
    source_mes_code: "3-TR-0001",
    quantity: 1,
    expanded_level: 0,
    lines: [],
  };
}

describe("IoTargetPicker row click", () => {
  it.each([
    "warehouse_to_dept",
    "internal_use_out",
    "warehouse_adjust_out",
  ] as const)("shows warehouse availability and reservations for %s", (subType) => {
    render(
      <IoTargetPicker
        {...baseProps}
        workType={subType === "warehouse_adjust_out" ? "warehouse_adjust" : "warehouse_io"}
        subType={subType}
        items={[makeItem({ warehouseQty: 10, pendingQty: 12 })]}
      />,
    );

    const row = screen.getByText("Clickable Item").closest("tr")!;
    const warehouseCell = within(row).getAllByRole("cell")[2];

    expect(warehouseCell).toHaveTextContent("출고 가능 0");
    expect(warehouseCell).toHaveTextContent("창고 10 · 예약 12");
  });

  it("subtracts a reservation from a positive warehouse quantity", () => {
    render(
      <IoTargetPicker
        {...baseProps}
        workType="warehouse_io"
        subType="warehouse_to_dept"
        items={[makeItem({ warehouseQty: 10, pendingQty: 3 })]}
      />,
    );

    const row = screen.getByText("Clickable Item").closest("tr")!;
    const warehouseCell = within(row).getAllByRole("cell")[2];

    expect(warehouseCell).toHaveTextContent("출고 가능 7");
    expect(warehouseCell).toHaveTextContent("창고 10 · 예약 3");
  });

  it("subtracts only the selected department production reservation and exposes it in the mobile row", () => {
    render(
      <IoTargetPicker
        {...baseProps}
        workType="process"
        subType="adjust_out"
        deptIoDirection="out"
        targetDepartment="조립"
        items={[makeItem({
          locations: [
            { department: "조립", status: "PRODUCTION", quantity: 10, pending_quantity: 3, available_quantity: 7 },
            { department: "고압", status: "PRODUCTION", quantity: 20, pending_quantity: 19, available_quantity: 1 },
          ],
        })]}
      />,
    );

    expect(screen.getByTestId("picker-mobile-source-available-item-1")).toHaveTextContent("출고 가능 7");
    const row = screen.getByText("Clickable Item").closest("tr")!;
    expect(within(row).getAllByRole("cell")[3]).toHaveTextContent("출고 가능 7");
    expect(within(row).getAllByRole("cell")[3]).toHaveTextContent("실재고 10 · 예약 3");
  });

  it("uses warehouse availability when defect quarantine starts from the warehouse", () => {
    render(
      <IoTargetPicker
        {...baseProps}
        workType="defect"
        subType="defect_quarantine"
        targetDepartment="창고"
        items={[makeItem({
          warehouseQty: 10,
          pendingQty: 3,
          locations: [
            { department: "조립", status: "PRODUCTION", quantity: 20, pending_quantity: 19, available_quantity: 1 },
          ],
        })]}
      />,
    );

    expect(screen.getByTestId("picker-mobile-source-available-item-1")).toHaveTextContent("출고 가능 7");
    const row = screen.getByText("Clickable Item").closest("tr")!;
    expect(within(row).getAllByRole("cell")[2]).toHaveTextContent("출고 가능 7");
    expect(within(row).getAllByRole("cell")[2]).toHaveTextContent("창고 10 · 예약 3");
    expect(within(row).getAllByRole("cell")[3]).not.toHaveTextContent("출고 가능 0");
  });

  it("keeps using the selected production location when defect quarantine starts from a department", () => {
    render(
      <IoTargetPicker
        {...baseProps}
        workType="defect"
        subType="defect_quarantine"
        targetDepartment="조립"
        items={[makeItem({
          warehouseQty: 10,
          pendingQty: 3,
          locations: [
            { department: "조립", status: "PRODUCTION", quantity: 9, pending_quantity: 2, available_quantity: 7 },
          ],
        })]}
      />,
    );

    expect(screen.getByTestId("picker-mobile-source-available-item-1")).toHaveTextContent("출고 가능 7");
    const row = screen.getByText("Clickable Item").closest("tr")!;
    expect(within(row).getAllByRole("cell")[2]).not.toHaveTextContent("출고 가능 7");
    expect(within(row).getAllByRole("cell")[3]).toHaveTextContent("출고 가능 7");
    expect(within(row).getAllByRole("cell")[3]).toHaveTextContent("실재고 9 · 예약 2");
  });

  it("keeps the warehouse cell as a single quantity when pending quantity is zero", () => {
    render(
      <IoTargetPicker
        {...baseProps}
        workType="warehouse_io"
        subType="warehouse_to_dept"
        items={[makeItem({ warehouseQty: 10, pendingQty: 0 })]}
      />,
    );

    const row = screen.getByText("Clickable Item").closest("tr")!;
    const warehouseCell = within(row).getAllByRole("cell")[2];

    expect(warehouseCell).toHaveTextContent("10");
    expect(warehouseCell).not.toHaveTextContent("출고 가능");
    expect(warehouseCell).not.toHaveTextContent("예약");
  });

  it.each([
    "warehouse_to_dept",
    "internal_use_out",
    "warehouse_adjust_out",
  ] as const)("shows mobile warehouse availability even without a reservation for %s", (subType) => {
    render(
      <IoTargetPicker
        {...baseProps}
        workType={subType === "warehouse_adjust_out" ? "warehouse_adjust" : "warehouse_io"}
        subType={subType}
        items={[makeItem({ warehouseQty: 10, pendingQty: 0 })]}
      />,
    );

    const availability = screen.getByTestId("picker-mobile-source-available-item-1");
    expect(availability).toHaveTextContent("출고 가능 10");
    expect(availability).not.toHaveTextContent("예약");
  });

  it("keeps the warehouse cell as a single quantity for supplier receipts", () => {
    render(<IoTargetPicker {...baseProps} items={[makeItem({ warehouseQty: 10, pendingQty: 3 })]} />);

    const row = screen.getByText("Clickable Item").closest("tr")!;
    const warehouseCell = within(row).getAllByRole("cell")[2];

    expect(warehouseCell).toHaveTextContent("10");
    expect(warehouseCell).not.toHaveTextContent("출고 가능");
    expect(warehouseCell).not.toHaveTextContent("예약");
  });

  it.each([
    ["BOM", "bom_parent"],
    ["낱개", "manual"],
  ] as const)("toggles off the selected %s bundle instead of adding its quantity", (label, sourceKind) => {
    const onAddItem = vi.fn();
    const onRemoveBundles = vi.fn();
    render(
      <IoTargetPicker
        {...baseProps}
        workType="warehouse_io"
        subType="warehouse_to_dept"
        bomParents={new Set(["item-1"])}
        bundles={[makeBundle(sourceKind)]}
        onAddItem={onAddItem}
        onRemoveBundles={onRemoveBundles}
      />,
    );

    const row = screen.getByText("Clickable Item").closest("tr")!;
    const selectedButton = within(row).getByRole("button", { name: label });

    expect(row).toHaveAttribute("data-selected", "true");
    expect(row).toHaveStyle({ background: "var(--c-success-bg)" });
    expect(selectedButton).toHaveStyle({ background: "var(--c-green)" });
    expect(selectedButton).toHaveAttribute("aria-pressed", "true");
    expect(selectedButton).not.toHaveTextContent("✓");
    fireEvent.click(selectedButton);
    expect(onRemoveBundles).toHaveBeenCalledWith([`bundle-${sourceKind}`]);
    expect(onAddItem).not.toHaveBeenCalled();
  });

  it("toggles off a selected single-only item instead of adding its quantity", () => {
    const onAddItem = vi.fn();
    const onRemoveBundles = vi.fn();
    render(
      <IoTargetPicker
        {...baseProps}
        bundles={[makeBundle("manual")]}
        onAddItem={onAddItem}
        onRemoveBundles={onRemoveBundles}
      />,
    );

    const row = screen.getByText("Clickable Item").closest("tr")!;
    const selectedButton = within(row).getByRole("button", { name: "선택" });

    expect(row).toHaveAttribute("data-selected", "true");
    expect(selectedButton).toHaveAttribute("aria-pressed", "true");
    expect(selectedButton).not.toHaveTextContent("✓");
    fireEvent.click(selectedButton);
    expect(onRemoveBundles).toHaveBeenCalledWith(["bundle-manual"]);
    expect(onAddItem).not.toHaveBeenCalled();
  });

  it("adds warehouse adjustment items as direct items without BOM or manual approval origin", () => {
    const onAddItem = vi.fn();
    render(
      <IoTargetPicker
        {...baseProps}
        workType={"warehouse_adjust" as IoWorkType}
        subType={"warehouse_adjust_in" as IoSubType}
        onAddItem={onAddItem}
      />,
    );

    fireEvent.click(screen.getByText("Clickable Item").closest("tr")!);

    expect(onAddItem).toHaveBeenCalledWith(
      expect.objectContaining({ item_id: "item-1" }),
      "direct_item",
    );
  });

  it("adds a single-only receive item when the row is clicked", () => {
    const onAddItem = vi.fn();
    render(<IoTargetPicker {...baseProps} onAddItem={onAddItem} />);

    fireEvent.click(screen.getByText("Clickable Item").closest("tr")!);

    expect(onAddItem).toHaveBeenCalledWith(expect.objectContaining({ item_id: "item-1" }), "manual");
  });

  it("adds a process single item as quantity adjustment instead of production", () => {
    const onAddItem = vi.fn();
    render(
      <IoTargetPicker
        {...baseProps}
        workType="process"
        subType="produce"
        deptIoDirection="in"
        bundleSubType="produce"
        bomParents={new Set(["item-1"])}
        bundles={[{ source_kind: "bom_parent", source_item_id: "item-1", lines: [] } as any]}
        onAddItem={onAddItem}
      />,
    );

    const row = screen.getByText("Clickable Item").closest("tr")!;
    const buttons = within(row).getAllByRole("button");
    const singleButton = buttons.find((button) => button.textContent !== "BOM")!;

    expect(singleButton).not.toBeDisabled();
    fireEvent.click(singleButton);

    expect(onAddItem).toHaveBeenCalledWith(expect.objectContaining({ item_id: "item-1" }), "manual", "adjust_in");
  });

  it("does not add a single-only process item twice when its nested button is clicked", () => {
    const onAddItem = vi.fn();
    render(
      <IoTargetPicker
        {...baseProps}
        workType="process"
        subType="adjust_in"
        deptIoDirection="in"
        bundleSubType="adjust_in"
        bomParents={new Set(["item-1"])}
        onAddItem={onAddItem}
      />,
    );

    const row = screen.getByText("Clickable Item").closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: "낱개" }));

    expect(onAddItem).toHaveBeenCalledTimes(1);
    expect(onAddItem).toHaveBeenCalledWith(expect.objectContaining({ item_id: "item-1" }), "manual", "adjust_in");
  });
});
