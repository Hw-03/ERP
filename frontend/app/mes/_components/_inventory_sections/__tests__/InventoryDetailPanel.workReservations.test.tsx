import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/api";
import { InventoryDetailPanel } from "../InventoryDetailPanel";

vi.mock("@/lib/queries/realtime", () => ({ useRealtimeRevision: () => 1 }));
vi.mock("../../DepartmentsContext", () => ({ useDeptColorLookup: () => () => "var(--c-blue)" }));
vi.mock("../InventoryDetailLocations", () => ({ InventoryDetailLocations: () => null }));
vi.mock("@/lib/queries/useInventoryWorkStatus", () => ({ useInventoryWorkStatus: () => ({ data: { item_id: "selected", works: [], summary: {
  work_reserved_quantity: 4, approval_reserved_quantity: 2, shipping_reserved_quantity: 0, expected_in_quantity: 0, expected_out_quantity: 0,
  transfer_in_quantity: 0, transfer_out_quantity: 0, forecast_complete: true, reservation_by_location: [], forecast_by_location: [],
} } }) }));
vi.mock("../BomDetailModal", () => ({ BomDetailModal: () => null }));

describe("대시보드 상세 작업 현황 연결", () => {
  it.each(["desktop", "mobile"] as const)("%s 상세에서 예약·입고 예정 카드와 예약 구분을 표시한다", (variant) => {
    render(<InventoryDetailPanel item={{ item_id: "selected", item_name: "자재", quantity: 10, warehouse_qty: 10, pending_quantity: 6, available_quantity: 4, locations: [], work_reservations: {
      work_reserved_quantity: 4, approval_reserved_quantity: 2, shipping_reserved_quantity: 0, expected_in_quantity: 0, expected_out_quantity: 0,
      transfer_in_quantity: 0, transfer_out_quantity: 0, forecast_complete: true, reservation_by_location: [], forecast_by_location: [],
    } } as unknown as Item}
      onGoToWarehouse={() => {}} quickActionVariant={variant} />);
    expect(screen.getByRole("group", { name: "수량 현황" }).children).toHaveLength(3);
    expect(screen.getByText("예약 재고").parentElement).toHaveTextContent("6");
    expect(screen.queryByText("승인 예약")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "예약 내역" }));
    expect(screen.getByText("승인 예약").parentElement).toHaveTextContent("2");
    expect(screen.queryByText("승인 대기 수량")).toBeNull();
    expect(screen.getByText("사용 가능 재고").parentElement).toHaveTextContent("4");
  });
});
