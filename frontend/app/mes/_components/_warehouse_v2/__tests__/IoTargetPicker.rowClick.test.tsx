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
