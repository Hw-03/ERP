import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/api";
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

import { IoLineRow, expectedAfter, isOutgoing } from "../IoLineRow";

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
    bom_stock_exempt: false,
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
  it("calculates current and expected warehouse stock for adjustment in/out", () => {
    const inbound = makeLine({
      direction: "adjust",
      from_bucket: "none",
      to_bucket: "warehouse",
      quantity: 3,
    });
    const outbound = makeLine({
      direction: "adjust",
      from_bucket: "warehouse",
      to_bucket: "none",
      quantity: 3,
    });

    expect(isOutgoing(inbound)).toBe(false);
    expect(expectedAfter(inbound, 5)).toBe(8);
    expect(isOutgoing(outbound)).toBe(true);
    expect(expectedAfter(outbound, 5)).toBe(2);
  });

  it("shows actual warehouse stock and expected stock while using available stock for shortage", () => {
    const onQuantityChange = vi.fn();
    render(
      <IoLineRow
        line={makeLine({
          direction: "adjust",
          from_bucket: "warehouse",
          to_bucket: "none",
          quantity: 3,
        })}
        subType="warehouse_adjust_out"
        isChild={false}
        item={{
          quantity: 10,
          warehouse_qty: 10,
          min_stock: null,
          mes_code: "T-001",
        } as Item}
        available={8}
        onToggle={() => {}}
        onQuantityChange={onQuantityChange}
        onRemove={() => {}}
      />,
    );

    expect(screen.getByText("현재 창고")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "9" } });
    expect(onQuantityChange).toHaveBeenCalledWith(9, 1);
  });

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

  it("aligns stock and remove controls to the BOM header desktop columns", () => {
    render(
      <IoLineRow
        line={makeLine({ origin: "manual" })}
        subType="receive_supplier"
        isChild={false}
        available={10}
        onToggle={() => {}}
        onQuantityChange={() => {}}
        onRemove={() => {}}
      />,
    );

    const removeButton = screen.getByRole("button", { name: "삭제" });
    const row = removeButton.parentElement;
    expect(row).toHaveClass("lg:pr-[18px]");
    expect(row).toHaveStyle({
      gridTemplateColumns:
        "32px minmax(0,1.6fr) minmax(70px,auto) auto minmax(80px,auto) minmax(80px,auto) 44px",
    });
    expect(screen.getByText("현재 재고").parentElement).toHaveClass("text-center");
    expect(screen.getByText("현재 재고").parentElement).not.toHaveClass("lg:text-right");
    expect(removeButton).toHaveClass("h-11", "w-11");
    expect(removeButton.querySelector("svg")).toHaveClass("h-5", "w-5");
  });

  it("aligns nested BOM controls to the enclosing card header edge on desktop", () => {
    render(
      <IoLineRow
        line={makeLine({ origin: "bom_auto" })}
        subType="receive_supplier"
        isChild
        available={10}
        onToggle={() => {}}
        onQuantityChange={() => {}}
        onRemove={() => {}}
      />,
    );

    const row = screen.getByRole("spinbutton", { name: "수량" }).closest("[style*='grid-template-columns']");
    if (!row) throw new Error("하위 BOM 수량 행을 찾을 수 없습니다.");
    expect(row).toHaveClass("lg:pr-0");
    expect(row).not.toHaveClass("lg:pr-[18px]");
  });

  it("shows the actual deduction source prominently on internal-use quantity rows", () => {
    render(
      <IoLineRow
        line={makeLine({
          direction: "out",
          from_bucket: "production",
          from_department: "고압",
          to_bucket: "none",
          quantity: 2,
        })}
        subType="internal_use_out"
        isChild={false}
        available={10}
        onToggle={() => {}}
        onQuantityChange={() => {}}
        onRemove={() => {}}
      />,
    );

    const sourceField = screen.getByLabelText("차감 위치: 고압");
    expect(sourceField).toHaveClass("min-w-[112px]", "flex-col", "gap-0.5");
    expect(screen.getByText("차감 위치")).toHaveClass("text-xs", "tracking-[1.5px]");
    const sourceContent = screen.getByText("고압").parentElement;
    expect(sourceContent).toHaveClass(
      "inline-flex",
      "items-center",
      "justify-center",
      "gap-1.5",
      "-translate-x-1",
    );
    expect(sourceContent?.parentElement).toHaveClass(
      "h-11",
      "min-h-[44px]",
      "rounded-[10px]",
      "flex",
      "justify-center",
    );
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

  it("locks an exempt automatic BOM child and shows its no-stock-effect state", () => {
    render(
      <IoLineRow
        line={makeLine({
          direction: "out",
          from_bucket: "production",
          quantity: 2,
          origin: "bom_auto",
          bom_stock_exempt: true,
          included: false,
          exclusion_note: "BOM 재고 미반영",
        })}
        subType="produce"
        isChild
        available={10}
        onToggle={() => {}}
        onQuantityChange={() => {}}
        onRemove={() => {}}
      />,
    );

    expect(screen.getByText("BOM 재고 미반영")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "BOM 재고 미반영 항목" })).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "수량" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "+1" })).toBeDisabled();
  });
});
