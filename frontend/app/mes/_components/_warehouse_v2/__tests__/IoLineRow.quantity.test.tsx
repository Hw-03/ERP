import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IoLine } from "@/lib/api/types/io";

vi.mock("../../DepartmentsContext", () => ({
  useDeptColorLookup: () => () => "#64748b",
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
});
