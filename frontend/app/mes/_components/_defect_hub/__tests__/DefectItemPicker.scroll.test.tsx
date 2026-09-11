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
  it("does not repeat the automatic department as a desktop table column", () => {
    render(
      <DefectItemPicker
        items={[makeItem(1)]}
        productModels={[]}
        source="production"
        selectedIds={new Set()}
        onAdd={() => {}}
        onRemove={() => {}}
      />,
    );

    expect(screen.queryByRole("columnheader", { name: "부서" })).not.toBeInTheDocument();
  });

  it("makes the result table the touch scroll owner and resets it on search", async () => {
    const { container } = render(
      <DefectItemPicker
        items={Array.from({ length: 30 }, (_, index) => makeItem(index + 1))}
        productModels={[]}
        source="production"
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

  it("keeps the department browse filter visible in warehouse source while requiring warehouse stock", () => {
    const withoutWarehouse = { ...makeItem(1), item_id: "no-warehouse", item_name: "창고 없음", warehouse_qty: 0 };
    render(
      <DefectItemPicker
        items={[makeItem(2), withoutWarehouse]}
        productModels={[]}
        source="warehouse"
        selectedIds={new Set()}
        onAdd={() => {}}
        onRemove={() => {}}
      />,
    );

    expect(screen.getAllByRole("combobox")).toHaveLength(3);
    expect(screen.getByText("SOLO item 2")).toBeInTheDocument();
    expect(screen.queryByText("창고 없음")).not.toBeInTheDocument();
  });

  it("blocks an unmapped item only for production source", () => {
    const unmapped = { ...makeItem(3), item_id: "unmapped", item_name: "미지정 품목", process_type_code: "XX" };
    const { rerender } = render(
      <DefectItemPicker
        items={[unmapped]}
        productModels={[]}
        source="production"
        selectedIds={new Set()}
        onAdd={() => {}}
        onRemove={() => {}}
      />,
    );

    expect(screen.getByText("부서 미지정 · 생산 출처에서 추가할 수 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "미지정 품목 장바구니에 추가" })).toBeDisabled();

    rerender(
      <DefectItemPicker
        items={[unmapped]}
        productModels={[]}
        source="warehouse"
        selectedIds={new Set()}
        onAdd={() => {}}
        onRemove={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "미지정 품목 장바구니에 추가" })).toBeEnabled();
  });
});
