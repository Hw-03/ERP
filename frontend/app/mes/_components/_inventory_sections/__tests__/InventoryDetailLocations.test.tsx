import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/api";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { InventoryDetailLocations } from "../InventoryDetailLocations";

describe("InventoryDetailLocations", () => {
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
