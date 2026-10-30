import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/api";
import { InventoryStockSummary } from "../InventoryStockSummary";

vi.mock("../../DepartmentsContext", () => ({ useDeptColorLookup: () => () => "var(--c-blue)" }));

function makeItem(quantity = 70, reserved = 40): Item {
  return {
    quantity, warehouse_qty: 0, locations: [{ department: "튜브", status: "PRODUCTION", quantity }],
    work_reservations: {
      work_reserved_quantity: reserved, approval_reserved_quantity: 0, shipping_reserved_quantity: 0,
      expected_in_quantity: 0, forecast_complete: true, forecast_by_location: [],
      reservation_by_location: [{ location: { bucket: "production", department: "튜브" },
        work_reserved_quantity: reserved, approval_reserved_quantity: 0, shipping_reserved_quantity: 0 }],
      reservation_by_requester_department: [{ requester_department: "조립", work_reserved_quantity: reserved,
        approval_reserved_quantity: 0, shipping_reserved_quantity: 0 }],
    },
  } as Item;
}

describe("보관 위치별 가용·예약", () => {
  it.each([false, true])("실물 70을 가용 30과 예약 40으로 같은 보관 부서에 묶는다 (compact=%s)", (compact) => {
    render(<InventoryStockSummary item={makeItem()} compact={compact} showWorkReservations />);
    const group = screen.getByRole("group", { name: "튜브 재고" });
    expect(within(group).getByText("튜브 가용 30")).toBeVisible();
    expect(within(group).getByText("튜브 예약 40")).toBeVisible();
    expect(screen.queryByText(/조립 예약/)).toBeNull();
  });

  it.each([[70, 0, 70], [70, 70, 0], [0, 80, 0], [7.5, 2.25, 5.25]])(
    "실재고 %s, 예약 %s를 가용 %s로 표시하고 예약은 보존한다", (quantity, reserved, available) => {
      render(<InventoryStockSummary item={makeItem(quantity, reserved)} showWorkReservations />);
      expect(screen.getByText(`튜브 가용 ${available}`)).toBeVisible();
      if (reserved > 0) expect(screen.getByText(`튜브 예약 ${reserved}`)).toBeVisible();
      else expect(screen.queryByText(/튜브 예약/)).toBeNull();
    },
  );

  it("동일 부서의 여러 재고와 여러 종류의 예약을 합산 후 한 번만 차감한다", () => {
    const item = makeItem();
    item.warehouse_qty = 10;
    item.locations = [{ department: "튜브", status: "PRODUCTION", quantity: 20 },
      { department: "튜브", status: "PRODUCTION", quantity: 50 }];
    item.work_reservations!.work_reserved_quantity = 30;
    item.work_reservations!.approval_reserved_quantity = 5;
    item.work_reservations!.shipping_reserved_quantity = 10;
    item.work_reservations!.reservation_by_location = [
      { location: { bucket: "production", department: "튜브" }, work_reserved_quantity: 20, approval_reserved_quantity: 5, shipping_reserved_quantity: 10 },
      { location: { bucket: "production", department: "튜브" }, work_reserved_quantity: 5, approval_reserved_quantity: 0, shipping_reserved_quantity: 0 },
      { location: { bucket: "warehouse", department: null }, work_reserved_quantity: 5, approval_reserved_quantity: 0, shipping_reserved_quantity: 0 },
    ];
    render(<InventoryStockSummary item={item} showWorkReservations />);
    expect(screen.getAllByText("튜브 가용 30")).toHaveLength(1);
    expect(screen.getByText("튜브 예약 40")).toBeVisible();
    expect(screen.getByText("창고 가용 5")).toBeVisible();
    expect(screen.getByText("창고 예약 5")).toBeVisible();
  });

  it("같은 위치의 재고 행이 나뉘어도 막대의 예약을 중복 표시하지 않는다", () => {
    const item = makeItem();
    item.locations = [{ department: "튜브", status: "PRODUCTION", quantity: 20 },
      { department: "튜브", status: "PRODUCTION", quantity: 50 }];
    render(<InventoryStockSummary item={item} mode="bar" showWorkReservations />);
    const bar = screen.getByRole("img", { name: /재고 분포/ });
    expect(bar.children).toHaveLength(1);
    expect(bar.children[0]).toHaveStyle({ width: "100%" });
    expect(bar.querySelectorAll("[data-reservation-overlay]")).toHaveLength(1);
    expect(bar).toHaveAttribute("title", "튜브 실재고 70 · 가용 30 · 예약 40");
  });

  it("소수 합산 오차를 위치 미확인 예약 0으로 표시하지 않는다", () => {
    const item = makeItem(1, 0.1 + 0.2);
    item.work_reservations!.reservation_by_location[0].work_reserved_quantity = 0.3;
    render(<InventoryStockSummary item={item} showWorkReservations />);
    expect(screen.getByText("튜브 가용 0.7")).toBeVisible();
    expect(screen.getByText("튜브 예약 0.3")).toBeVisible();
    expect(screen.queryByText(/위치 미확인/)).toBeNull();
  });

  it.each(["summary", "locations", "partial"])("%s 누락 시 가용을 추측하지 않고 위치 미확인 예약을 보존한다", (missing) => {
    const item = makeItem();
    if (missing === "summary") {
      item.work_reservations = undefined;
      item.pending_quantity = 40;
    } else if (missing === "locations") item.work_reservations!.reservation_by_location = [];
    else item.work_reservations!.reservation_by_location[0].work_reserved_quantity = 10;
    render(<InventoryStockSummary item={item} showWorkReservations />);
    expect(screen.getByText("튜브 실재고 70")).toBeVisible();
    expect(screen.queryByText(/가용/)).toBeNull();
    expect(screen.getByText(`위치 미확인 예약 ${missing === "partial" ? 30 : 40}`)).toBeVisible();
  });
});
