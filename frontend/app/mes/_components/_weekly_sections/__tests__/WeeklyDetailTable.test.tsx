import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeeklyDetailTable } from "../WeeklyDetailTable";

describe("WeeklyDetailTable verified columns", () => {
  it("shows the fixed seven inventory columns including defect", () => {
    render(
      <WeeklyDetailTable
        group={{
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
        }}
      />,
    );

    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "품목 코드",
      "품명",
      "전주 재고",
      "생산",
      "입고",
      "출고",
      "불량",
      "현재 재고",
      "증감",
    ]);
    expect(screen.getByText("불량 1")).toBeInTheDocument();
  });
});
