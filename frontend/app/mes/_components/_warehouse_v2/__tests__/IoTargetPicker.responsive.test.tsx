import { render } from "@testing-library/react";
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
    item_name: "히팅 싱크 + 방열팬 (신형)",
    mes_code: "46-AA-0081",
    quantity: 0,
    warehouse_qty: 200,
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

describe("IoTargetPicker responsive layout", () => {
  it("does not switch item table columns at the Tailwind sm breakpoint", () => {
    const { container } = render(<IoTargetPicker {...baseProps} />);
    const table = container.querySelector("table");

    expect(table).not.toBeNull();
    expect(table!.innerHTML).not.toContain("sm:");
    expect(table!.innerHTML).toContain("lg:");
  });
});
