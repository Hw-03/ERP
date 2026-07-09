import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "../types";
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

function makeItem(): Item {
  return {
    item_id: "item-1",
    item_name: "Clickable Item",
    mes_code: "3-TR-0001",
    quantity: 0,
    warehouse_qty: 0,
    min_stock: null,
    locations: [],
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
  onAdvance: vi.fn(),
};

describe("IoTargetPicker row click", () => {
  it("adds a single-only receive item when the row is clicked", () => {
    const onAddItem = vi.fn();
    render(<IoTargetPicker {...baseProps} onAddItem={onAddItem} />);

    fireEvent.click(screen.getByText("Clickable Item").closest("tr")!);

    expect(onAddItem).toHaveBeenCalledWith(expect.objectContaining({ item_id: "item-1" }), "manual");
  });

  it("allows adding a manual line to an existing process BOM batch", () => {
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

    expect(onAddItem).toHaveBeenCalledWith(expect.objectContaining({ item_id: "item-1" }), "manual", "produce");
  });
});
