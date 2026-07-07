import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IoLine } from "@/lib/api/types/io";

vi.mock("../../DepartmentsContext", () => ({
  useDeptColorLookup: () => () => "#64748b",
}));

vi.mock("../BomSubExpander", () => ({
  BomSubExpander: ({
    open,
    compact,
    tapToExpandName,
  }: {
    open: boolean;
    compact?: boolean;
    tapToExpandName?: boolean;
  }) =>
    open ? (
      <div
        data-testid="bom-expander"
        data-compact={String(compact)}
        data-tap-to-expand-name={String(tapToExpandName)}
      />
    ) : null,
}));

import { IoLineRow } from "../IoLineRow";

function makeLine(overrides: Partial<IoLine> = {}): IoLine {
  return {
    line_id: "line-1",
    item_id: "item-1",
    item_name: "Test item",
    mes_code: "T-001",
    unit: "EA",
    direction: "in",
    from_bucket: "none",
    from_department: null,
    to_bucket: "warehouse",
    to_department: null,
    quantity: 1,
    bom_expected: null,
    included: true,
    origin: "direct",
    edited: false,
    has_children: false,
    shortage: 0,
    exclusion_note: null,
    ...overrides,
  };
}

describe("IoLineRow quantity", () => {
  it("does not mark supplier receipt as shortage when current stock is zero", () => {
    const onQuantityChange = vi.fn();
    render(
      <IoLineRow
        line={makeLine({ direction: "in", quantity: 1 })}
        subType="receive_supplier"
        isChild={false}
        available={0}
        onToggle={() => {}}
        onQuantityChange={onQuantityChange}
        onRemove={() => {}}
      />,
    );

    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "24" } });

    expect(onQuantityChange).toHaveBeenCalledWith(24, 0);
  });

  it("uses the shared accessible quantity stepper on mobile rows", () => {
    render(
      <IoLineRow
        line={makeLine({ direction: "out", quantity: 2 })}
        subType="warehouse_to_dept"
        isChild={false}
        available={10}
        onToggle={() => {}}
        onQuantityChange={() => {}}
        onRemove={() => {}}
      />,
    );

    expect(screen.getByRole("spinbutton", { name: "수량" })).toHaveClass("min-h-[44px]");
    expect(screen.getByRole("button", { name: "-1" })).toHaveClass("min-h-[44px]");
  });

  it("opens child composition in compact tap-to-expand mode", () => {
    render(
      <IoLineRow
        line={makeLine({ has_children: true })}
        subType="warehouse_to_dept"
        isChild
        available={10}
        onToggle={() => {}}
        onQuantityChange={() => {}}
        onRemove={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "하위 있음" }));

    expect(screen.getByTestId("bom-expander")).toHaveAttribute("data-compact", "true");
    expect(screen.getByTestId("bom-expander")).toHaveAttribute(
      "data-tap-to-expand-name",
      "true",
    );
  });
});
