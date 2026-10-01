import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/api";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { InventoryDetailLocations } from "../InventoryDetailLocations";

describe("InventoryDetailLocations", () => {
  it("splits each department's managed stock into correctly named and colored links", () => {
    render(<InventoryDetailLocations item={{
      warehouse_qty: 0,
      locations: [
        { department: "조립", status: "PRODUCTION", quantity: 123 },
        { department: "조립", status: "DEFECTIVE", quantity: 42 },
      ],
      defective_breakdown: [
        { department: "조립", management_category: "DEFECT", quantity: 2 },
        { department: "조립", management_category: "B_GRADE", quantity: 10 },
        { department: "조립", management_category: "OBSOLETE", quantity: 30 },
        { department: "AS", management_category: "B_GRADE", quantity: 4 },
        { department: "AS", management_category: "OBSOLETE", quantity: 0 },
      ],
    } as Item} getDeptColor={() => "var(--c-blue)"} />);
    const defect = screen.getByRole("button", { name: "조립 불량 2 — 불량 탭으로 이동" });
    const bGrade = screen.getByRole("button", { name: "조립 B급 10 — 불량 탭으로 이동" });
    const obsolete = screen.getByRole("button", { name: "조립 구형 30 — 불량 탭으로 이동" });
    expect(within(defect).getByText("조립 [불량]")).toHaveStyle({ color: "#ef4444" });
    expect(within(bGrade).getByText("조립 [B급]")).toHaveStyle({ color: "var(--c-stock-b-grade)" });
    expect(within(obsolete).getByText("조립 [구형]")).toHaveStyle({ color: "var(--c-stock-obsolete)" });
    expect(screen.getByRole("button", { name: "AS B급 4 — 불량 탭으로 이동" })).toBeInTheDocument();
    expect(screen.queryByText("AS [구형]")).toBeNull();
    expect(screen.queryByRole("button", { name: /조립 불량 42/ })).toBeNull();
    expect(screen.getByText("조립").previousElementSibling).toHaveStyle({ background: "var(--c-blue)" });
    fireEvent.click(obsolete);
    expect(push).toHaveBeenCalledWith("/?tab=defect");
  });

  it("keeps legacy defective location reservations when no category breakdown is supplied", () => {
    render(<InventoryDetailLocations item={{ warehouse_qty: 0, locations: [
      { department: "튜브", status: "DEFECTIVE", quantity: 8, pending_quantity: 3, available_quantity: 5 },
    ] } as Item} getDeptColor={() => "var(--c-blue)"} />);
    expect(screen.getByRole("button", { name: "튜브 불량 8 — 불량 탭으로 이동" })).toBeInTheDocument();
    expect(screen.getByText("출고 가능 5")).toBeInTheDocument();
    expect(screen.getByText("실재고 8 · 예약 3")).toBeInTheDocument();
  });

  it("shows available, physical, and pending quantities independently for warehouse and each location", () => {
    render(
      <InventoryDetailLocations
        item={{
          warehouse_qty: 10,
          pending_quantity: 3,
          locations: [
            { department: "조립", status: "PRODUCTION", quantity: 8, pending_quantity: 3, available_quantity: 5 },
            { department: "고압", status: "PRODUCTION", quantity: 4 },
          ],
        } as Item}
        getDeptColor={() => "#123456"}
      />,
    );

    expect(screen.getByText("출고 가능 7")).toBeInTheDocument();
    expect(screen.getByText("실재고 10 · 예약 3")).toBeInTheDocument();
    expect(screen.getByText("출고 가능 5")).toBeInTheDocument();
    expect(screen.getByText("실재고 8 · 예약 3")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });
});
