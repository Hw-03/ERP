import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/api";
import { InventoryDetailLocations } from "../InventoryDetailLocations";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("위치별 모든 예약 차감", () => {
  it("대시보드 위치 재고를 카드로 표시한다", () => {
    const item = { warehouse_qty: 10, locations: [] } as unknown as Item;
    render(<InventoryDetailLocations item={item} getDeptColor={() => "var(--c-blue)"} />);
    expect(screen.getByText("위치별 재고").closest("section")).toHaveClass("rounded-[28px]");
    expect(screen.getByText("창고").closest("div")).toHaveClass("rounded-[14px]");
  });

  it("기존 과예약의 음수 가용량을 0으로 숨기지 않는다", () => {
    const item = { warehouse_qty: 2, locations: [{ department: "조립", status: "PRODUCTION", quantity: 1 }],
      work_reservations: { reservation_by_location: [
        { location: { bucket: "warehouse", department: null }, work_reserved_quantity: 1, approval_reserved_quantity: 1, shipping_reserved_quantity: 1 },
        { location: { bucket: "production", department: "조립" }, work_reserved_quantity: 1, approval_reserved_quantity: 1, shipping_reserved_quantity: 1 },
      ] },
    } as unknown as Item;
    render(<InventoryDetailLocations item={item} getDeptColor={() => "var(--c-blue)"} />);
    expect(screen.getByText("출고 가능 -1")).toBeInTheDocument();
    expect(screen.getByText("출고 가능 -2")).toBeInTheDocument();
  });

  it("정상 위치의 작업·승인·출하 예약을 한 번씩 차감한다", () => {
    const item = { warehouse_qty: 10, pending_quantity: 3, locations: [{ department: "조립", status: "PRODUCTION", quantity: 8, pending_quantity: 1 }],
      work_reservations: { reservation_by_location: [
        { location: { bucket: "warehouse", department: null }, work_reserved_quantity: 2, approval_reserved_quantity: 1, shipping_reserved_quantity: 2 },
        { location: { bucket: "production", department: "조립" }, work_reserved_quantity: 1, approval_reserved_quantity: 0, shipping_reserved_quantity: 1 },
      ] },
    } as unknown as Item;
    render(<InventoryDetailLocations item={item} getDeptColor={() => "var(--c-blue)"} />);
    expect(screen.getByText("출고 가능 5")).toBeInTheDocument();
    expect(screen.getByText("실재고 10 · 예약 5")).toBeInTheDocument();
    expect(screen.getByText("출고 가능 6")).toBeInTheDocument();
    expect(screen.getByText("실재고 8 · 예약 2")).toBeInTheDocument();
  });
});
