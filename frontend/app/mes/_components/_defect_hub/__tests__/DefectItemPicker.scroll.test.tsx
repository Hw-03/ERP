import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "../../_warehouse_v2/types";
import { DefectItemPicker } from "../DefectItemPicker";

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

function makeItem(index: number): Item {
  return {
    item_id: `item-${index}`,
    item_name: `SOLO item ${index}`,
    mes_code: `46-AA-${String(index).padStart(4, "0")}`,
    quantity: 10,
    warehouse_qty: 10,
    production_total: 0,
    defective_total: 0,
    pending_quantity: 0,
    available_quantity: 10,
    min_stock: null,
    locations: [],
    model_slots: [],
    deleted_at: null,
  } as unknown as Item;
}

describe("DefectItemPicker mobile scroll", () => {
  it("makes the result table the touch scroll owner and resets it on search", async () => {
    const { container } = render(
      <DefectItemPicker
        items={Array.from({ length: 30 }, (_, index) => makeItem(index + 1))}
        productModels={[]}
        targetDepartment="조립"
        lockedDepartment="조립"
        selectedIds={new Set()}
        onAdd={() => {}}
        onRemove={() => {}}
      />,
    );
    const table = screen.getByTestId("defect-picker-table");
    const input = container.querySelector("input");

    expect(input).toBeTruthy();
    expect(table).toHaveClass("min-h-0", "flex-1", "overflow-y-auto", "touch-pan-y", "overscroll-contain");

    table.scrollTop = 120;
    fireEvent.change(input as HTMLInputElement, { target: { value: "SOLO item 2" } });

    await waitFor(() => expect(table.scrollTop).toBe(0));
  });
});
