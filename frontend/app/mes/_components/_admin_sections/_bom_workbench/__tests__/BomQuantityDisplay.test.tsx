import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BOMDetailEntry, BOMEntry, Item } from "@/lib/api";
import { BomEditPanel } from "../BomEditPanel";
import { BomReviewModal } from "../BomReviewModal";
import { BomWhereUsedPanel } from "../BomWhereUsedPanel";

function item(overrides: Partial<Item> = {}): Item {
  return {
    item_id: "parent",
    item_name: "Parent",
    mes_code: "PARENT-001",
    unit: "EA",
    quantity: 0,
    locations: [],
    process_type_code: "AA",
    ...overrides,
  } as Item;
}

const row: BOMEntry = {
  bom_id: "bom-1",
  parent_item_id: "parent",
  child_item_id: "child",
  quantity: 1.5,
  unit: "EA",
  notes: null,
};

const detailRow: BOMDetailEntry = {
  bom_id: "bom-1",
  parent_item_id: "parent",
  parent_item_name: "Parent",
  parent_mes_code: "PARENT-001",
  child_item_id: "child",
  child_item_name: "Child",
  child_mes_code: "CHILD-001",
  quantity: 1.5,
  unit: "EA",
};

describe("BOM admin quantity display", () => {
  it("uses the compact BOM quantity formatter in current and where-used rows", () => {
    const parent = item();
    const child = item({ item_id: "child", item_name: "Child", mes_code: "CHILD-001" });
    const { unmount } = render(
      <BomEditPanel
        parent={parent}
        bomRows={[row]}
        items={[parent, child]}
        onSaveQty={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("1.5EA")).toBeInTheDocument();
    expect(screen.queryByText(/×/)).not.toBeInTheDocument();
    unmount();

    render(
      <BomWhereUsedPanel
        selected={child}
        rows={[detailRow]}
        items={[parent, child]}
        onSelectParent={vi.fn()}
      />,
    );

    expect(screen.getByText("1.5EA")).toBeInTheDocument();
    expect(screen.getByText("1.5EA")).toHaveClass("text-center");
    expect(screen.queryByText(/×/)).not.toBeInTheDocument();
  });

  it("uses the compact BOM quantity formatter in the review modal", () => {
    render(
      <BomReviewModal
        parent={item()}
        rows={[row]}
        items={[item(), item({ item_id: "child", item_name: "Child" })]}
        isCompleted={false}
        onClose={vi.fn()}
        onConfirm={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText("1.5EA")).toBeInTheDocument();
    expect(screen.getByText("1.5EA")).toHaveClass("text-center");
    expect(screen.queryByText(/×/)).not.toBeInTheDocument();
  });
});
