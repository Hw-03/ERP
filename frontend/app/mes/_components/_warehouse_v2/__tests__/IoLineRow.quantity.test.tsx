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
  it.each(["receive_supplier", "outbound_supplier"] as const)("원자재 %s는 코드와 실제 창고 위치만 표시한다", (subType) => {
    const props = {
      line: makeLine({
        mes_code: "6-HR-0001",
        direction: subType === "receive_supplier" ? "in" : "out",
        from_bucket: subType === "receive_supplier" ? "none" : "warehouse",
        to_bucket: subType === "receive_supplier" ? "warehouse" : "none",
      }), isChild: false,
      item: { mes_code: "6-HR-0001", quantity: 5 } as Item,
      available: 5, onToggle: vi.fn(), onQuantityChange: vi.fn(), onRemove: vi.fn(),
    };
    render(<IoLineRow {...props} subType={subType} />);
    expect(screen.getByLabelText(`${subType === "receive_supplier" ? "입고 위치" : "차감 위치"}: 창고`)).toBeInTheDocument();
    expect(screen.queryByText("직접 선택")).not.toBeInTheDocument();
    expect(screen.queryByText("상위")).not.toBeInTheDocument();
    expect(screen.queryByText("재고 반영 포함")).not.toBeInTheDocument();
    expect(screen.queryByText("고압")).not.toBeInTheDocument();
    expect(screen.getByText("6-HR-0001")).toBeInTheDocument();
    expect(screen.getByLabelText("수량")).toBeInTheDocument();
  });
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

  it("8.16-04: 창고 수량보정은 실제 창고 수량과 실행 후 수량을 표시한다", () => {
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

    expect(screen.getByText("창고 수량")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "9" } });
    expect(onQuantityChange).toHaveBeenCalledWith(9, 1);
  });

  it("8.17-04: 원자재 입고는 창고 수량을 표시하고 현재 재고 문구를 쓰지 않는다", () => {
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
    expect(screen.getByText("창고 수량")).toBeInTheDocument();
    expect(screen.queryByText("현재 재고")).not.toBeInTheDocument();
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

  it("자동 부서 이동 라인에는 품목별 실제 창고→부서 경로를 표시한다", () => {
    render(
      <IoLineRow
        line={makeLine({
          direction: "move",
          from_bucket: "warehouse",
          to_bucket: "production",
          to_department: "고압",
        })}
        subType="warehouse_to_dept"
        isChild={false}
        available={10}
        onToggle={() => {}}
        onQuantityChange={() => {}}
        onRemove={() => {}}
      />,
    );

    expect(screen.getByText("창고 → 고압")).toBeInTheDocument();
  });

  it("uses included for non-internal-use checkbox state even when the server sends selected", () => {
    render(
      <IoLineRow
        line={makeLine({ included: false, selected: true })}
        subType="warehouse_to_dept"
        isChild={false}
        available={10}
        onToggle={() => {}}
        onQuantityChange={() => {}}
        onRemove={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "재고 반영 변경" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("shows unchanged available stock as the execution-after quantity for an excluded line", () => {
    render(
      <IoLineRow
        line={makeLine({
          direction: "out",
          from_bucket: "warehouse",
          to_bucket: "none",
          quantity: 0,
          included: false,
          exclusion_note: "이번 작업 제외",
        })}
        subType="warehouse_to_dept"
        isChild
        available={10}
        onToggle={() => {}}
        onQuantityChange={() => {}}
        onRemove={() => {}}
      />,
    );

    expect(screen.getByText("실행 후").parentElement).toHaveTextContent("10");
  });

  it("dims only the item identity area when a warehouse line is excluded", () => {
    render(
      <IoLineRow
        line={makeLine({
          direction: "out",
          from_bucket: "warehouse",
          to_bucket: "none",
          quantity: 0,
          included: false,
          exclusion_note: "이번 작업 제외",
        })}
        subType="warehouse_to_dept"
        isChild
        available={10}
        onToggle={() => {}}
        onQuantityChange={() => {}}
        onRemove={() => {}}
      />,
    );

    const row = screen.getByRole("spinbutton", { name: "수량" }).closest("[style*='grid-template-columns']");
    if (!row) throw new Error("제외된 수량 행을 찾을 수 없습니다.");
    expect(row).not.toHaveStyle({ opacity: "0.6" });
    expect(screen.getByRole("button", { name: "재고 반영 변경" })).toHaveStyle({ opacity: "0.6" });
    expect(screen.getByText("가능 재고").parentElement).not.toHaveStyle({ opacity: "0.6" });
  });

  it("원자재 행도 위치 칸을 포함해 수량과 재고를 정렬한다", () => {
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
        "32px minmax(0,1.6fr) minmax(112px,auto) auto minmax(80px,auto) minmax(80px,auto) 44px",
    });
    expect(screen.getByText("창고 수량").parentElement).toHaveClass("text-center");
    expect(screen.getByText("창고 수량").parentElement).not.toHaveClass("lg:text-right");
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

  it("연구 사용출고 상태는 배지만 남기고 같은 보조 문구를 반복하지 않는다", () => {
    render(
      <IoLineRow
        line={makeLine({
          selected: false,
          direction: "in",
          from_bucket: "none",
          to_bucket: "production",
          to_department: "조립",
          included: true,
        })}
        subType="internal_use_out"
        isChild
        available={0}
        onToggle={() => {}}
        onQuantityChange={() => {}}
        onRemove={() => {}}
      />,
    );

    expect(screen.getAllByText("소속 부서 재입고")).toHaveLength(1);
  });

  it("연구 사용출고 BOM 하위 수량은 증감 버튼 없이 읽기 전용으로 표시한다", () => {
    const onQuantityChange = vi.fn();
    render(
      <IoLineRow
        line={makeLine({
          direction: "out",
          from_bucket: "warehouse",
          to_bucket: "none",
          quantity: 4,
          bom_expected: 4,
          origin: "bom_auto",
        })}
        subType="internal_use_out"
        isChild
        available={10}
        onToggle={() => {}}
        onQuantityChange={onQuantityChange}
        onRemove={() => {}}
      />,
    );

    const quantity = screen.getByLabelText("수량");
    expect(quantity).toHaveTextContent("4");
    expect(quantity).toHaveAttribute("aria-readonly", "true");
    expect(quantity).toHaveClass("h-11", "min-h-[44px]", "w-[72px]");
    expect(screen.queryByRole("spinbutton", { name: "수량" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "-1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+1" })).not.toBeInTheDocument();
    expect(onQuantityChange).not.toHaveBeenCalled();
  });

  it("연구 사용출고 낱개 행은 기존 수량 조절기를 유지한다", () => {
    render(
      <IoLineRow
        line={makeLine({
          direction: "out",
          from_bucket: "warehouse",
          to_bucket: "none",
          quantity: 2,
          origin: "direct",
        })}
        subType="internal_use_out"
        isChild={false}
        available={10}
        onToggle={() => {}}
        onQuantityChange={() => {}}
        onRemove={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "-1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+1" })).toBeInTheDocument();
  });

  it("부서 BOM 자동 하위의 체크를 눌러 수량 0 제외를 시작할 수 있다", () => {
    const onToggle = vi.fn();
    render(
      <IoLineRow
        line={makeLine({
          direction: "out",
          from_bucket: "production",
          from_department: "조립",
          to_bucket: "none",
          quantity: 2,
          bom_expected: 2,
          origin: "bom_auto",
        })}
        subType="produce"
        isChild
        available={10}
        onToggle={onToggle}
        onQuantityChange={() => {}}
        onRemove={() => {}}
      />,
    );

    const stockToggle = screen.getByRole("button", { name: "재고 반영 변경" });
    expect(stockToggle).toBeEnabled();
    fireEvent.click(stockToggle);
    expect(onToggle).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "-1" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "+1" })).toBeEnabled();
  });

  it("제외된 부서 BOM 자동 하위의 체크를 다시 눌러 수량 1 포함을 요청할 수 있다", () => {
    const onToggle = vi.fn();
    render(
      <IoLineRow
        line={makeLine({
          direction: "out",
          from_bucket: "production",
          from_department: "조립",
          to_bucket: "none",
          quantity: 0,
          included: false,
          edited: true,
          bom_expected: 2,
          origin: "bom_auto",
        })}
        subType="produce"
        isChild
        available={10}
        onToggle={onToggle}
        onQuantityChange={() => {}}
        onRemove={() => {}}
      />,
    );

    const stockToggle = screen.getByRole("button", { name: "재고 반영 변경" });
    expect(stockToggle).toBeEnabled();
    fireEvent.click(stockToggle);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("연구 사용출고 재고 미반영 행은 안내를 한 번만 표시한다", () => {
    render(
      <IoLineRow
        line={makeLine({
          direction: "out",
          from_bucket: "production",
          quantity: 2,
          origin: "bom_auto",
          bom_stock_exempt: true,
          included: false,
        })}
        subType="internal_use_out"
        isChild
        available={10}
        onToggle={() => {}}
        onQuantityChange={() => {}}
        onRemove={() => {}}
      />,
    );

    expect(screen.getAllByText("BOM 재고 미반영")).toHaveLength(1);
    expect(screen.queryByText("BOM 자동 처리 시 재고 미반영")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/차감 위치:/)).not.toBeInTheDocument();
    const quantity = screen.getByRole("textbox", { name: "수량" });
    expect(quantity).toHaveTextContent("2");
    expect(quantity).toHaveClass("h-11", "min-h-[44px]", "w-[72px]");
    expect(screen.queryByRole("button", { name: "-1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+1" })).not.toBeInTheDocument();
    expect(screen.getAllByText("10")).toHaveLength(2);
  });

  it("창고 입출고 행은 경로를 위치 칸으로 옮기고 정상 보조 문구를 제거한다", () => {
    render(
      <IoLineRow
        line={makeLine({ direction: "move", from_bucket: "warehouse", to_bucket: "production", to_department: "튜브", origin: "manual" })}
        subType="warehouse_to_dept"
        isChild={false}
        available={10}
        onToggle={() => {}}
        onQuantityChange={() => {}}
        onRemove={() => {}}
      />,
    );

    expect(screen.getByLabelText("이동 경로: 창고 → 튜브")).toBeInTheDocument();
    expect(screen.queryByTestId("io-line-route")).not.toBeInTheDocument();
    expect(screen.queryByText("재고 반영 포함")).not.toBeInTheDocument();
    expect(screen.queryByText("이 품목만")).not.toBeInTheDocument();
  });

  it.each([
    ["dept_to_warehouse", { direction: "move", from_bucket: "production", from_department: "튜브", to_bucket: "warehouse" }, "이동 경로: 튜브 → 창고"],
    ["produce", { to_bucket: "production", to_department: "고압" }, "입고 위치: 고압"],
    ["disassemble", { direction: "out", from_bucket: "production", from_department: "고압", to_bucket: "none" }, "차감 위치: 고압"],
    ["warehouse_adjust_in", { direction: "adjust", to_bucket: "warehouse" }, "조정 위치: 창고"],
    ["warehouse_adjust_out", { direction: "adjust", from_bucket: "warehouse", to_bucket: "none" }, "조정 위치: 창고"],
  ] as const)("%s는 실제 반영 위치를 표시한다", (subType, overrides, label) => {
    render(<IoLineRow line={makeLine(overrides)} subType={subType} isChild={false} available={10} onToggle={vi.fn()} onQuantityChange={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByLabelText(label)).toBeInTheDocument();
  });

  it("BOM 변환된 입고 효과의 위치를 표시한다", () => {
    const line = makeLine({ direction: "out", from_bucket: "production", from_department: "튜브", to_bucket: "none", origin: "bom_auto" });
    render(<IoLineRow line={line} inventoryEffect={{ ...line, direction: "in", from_bucket: "none", from_department: null, to_bucket: "production", to_department: "튜브" }} subType="produce" isChild available={10} onToggle={vi.fn()} onQuantityChange={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByLabelText("입고 위치: 튜브")).toBeInTheDocument();
    expect(screen.queryByLabelText(/차감 위치:/)).not.toBeInTheDocument();
    expect(screen.getByText("실행 후").parentElement).toHaveTextContent("11");
  });

  it.each([
    [{ included: false, exclusion_note: "회수 안 됨" }, undefined, "회수 안 됨"],
    [{}, null, "변동 없음"],
    [{ bom_stock_exempt: true, origin: "bom_auto" }, undefined, "BOM 재고 미반영"],
  ] as const)("반영 없는 행은 예외 안내만 남기고 위치에 이동을 표시하지 않는다", (overrides, inventoryEffect, note) => {
    render(<IoLineRow line={makeLine(overrides)} inventoryEffect={inventoryEffect} subType="disassemble" isChild available={10} onToggle={vi.fn()} onQuantityChange={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getAllByText(note)).toHaveLength(1);
    expect(screen.getByLabelText("재고 위치: —")).toBeInTheDocument();
    expect(screen.getByText("실행 후").parentElement).toHaveTextContent("10");
  });

  it("부서 위치가 누락되어도 품목 분류로 추정하지 않는다", () => {
    render(<IoLineRow line={makeLine({ to_bucket: "production", to_department: null, mes_code: "6-HR-0001" })} subType="produce" isChild={false} item={{ mes_code: "6-HR-0001", quantity: 5 } as Item} available={10} onToggle={vi.fn()} onQuantityChange={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByLabelText("입고 위치: 위치 확인 필요")).toBeInTheDocument();
    expect(screen.queryByText("고압")).not.toBeInTheDocument();
    expect(screen.queryByText("조립")).not.toBeInTheDocument();
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
