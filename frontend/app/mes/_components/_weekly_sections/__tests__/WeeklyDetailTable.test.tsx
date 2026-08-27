import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeeklyDetailTable } from "../WeeklyDetailTable";

const group = {
  process_code: "VF",
  dept_name: "진공",
  label: "진공",
  item_count: 1,
  prev_qty: 1,
  increase_qty: 1,
  decrease_qty: 1,
  produce_qty: 1,
  receive_qty: 0,
  out_qty: 0,
  defect_qty: 1,
  current_qty: 1,
  delta: 0,
  items: [{
    item_id: "item-1",
    mes_code: "8-VF-0006",
    item_name: "CSGR + CSCB",
    prev_qty: 1,
    produce_qty: 1,
    receive_qty: 0,
    out_qty: 0,
    defect_qty: 1,
    current_qty: 1,
    delta: 0,
  }],
};

describe("WeeklyDetailTable verified columns", () => {
  it("uses normal-stock labels for a verified report", () => {
    render(
      <WeeklyDetailTable
        group={group}
        stockBasis="normal"
      />,
    );

    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "품목 코드",
      "품명",
      "전주 정상재고",
      "생산",
      "입고",
      "출고",
      "불량",
      "현재 정상재고",
      "증감",
    ]);
    expect(screen.getByText("전주 정상")).toBeInTheDocument();
    expect(screen.getByText("현재 정상")).toBeInTheDocument();
    expect(screen.getByText("현재 정상재고 1")).toBeInTheDocument();
    expect(screen.getByText("불량 1")).toBeInTheDocument();
  });

  it("keeps legacy stock labels outside verified reports", () => {
    render(<WeeklyDetailTable group={group} stockBasis="legacy" />);

    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toContain("전주 재고");
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toContain("현재 재고");
    expect(screen.getByText("현재 재고 1")).toBeInTheDocument();
    expect(screen.getByText("전주")).toBeInTheDocument();
    expect(screen.getByText("현재")).toBeInTheDocument();
  });

  it("sticks the real table header and leaves horizontal scrolling to its parent", () => {
    render(<WeeklyDetailTable group={group} stockBasis="normal" />);

    const firstHeader = screen.getAllByRole("columnheader")[0];
    expect(firstHeader.closest("thead")).toHaveClass("sticky", "top-0", "z-10");
    expect(firstHeader).toHaveStyle({
      background: "var(--c-inventory-table-header)",
    });
    expect(screen.getByTestId("weekly-detail-summary")).toHaveClass("pt-2");
    expect(screen.getByTestId("weekly-detail-table")).not.toHaveClass("overflow-x-auto");
  });
});
