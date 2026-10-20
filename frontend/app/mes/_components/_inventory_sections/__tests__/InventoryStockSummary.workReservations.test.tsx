import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/api";
import { InventoryStockSummary } from "../InventoryStockSummary";
import { InventoryItemRow } from "../InventoryItemRow";
import { InventoryItemsTable } from "../InventoryItemsTable";

vi.mock("../../DepartmentsContext", () => ({ useDeptColorLookup: () => () => "var(--c-blue)" }));

const item = {
  item_id: "material", item_name: "예약 자재", unit: "EA", quantity: 20, warehouse_qty: 10,
  available_quantity: 13, locations: [{ department: "조립", status: "PRODUCTION", quantity: 10 }],
  work_reservations: {
    work_reserved_quantity: 4, approval_reserved_quantity: 2, shipping_reserved_quantity: 1,
    expected_in_quantity: 8, expected_out_quantity: 4, transfer_in_quantity: 0, transfer_out_quantity: 0,
    forecast_complete: true,
    reservation_by_location: [
      { location: { bucket: "warehouse", department: null }, work_reserved_quantity: 3, approval_reserved_quantity: 1, shipping_reserved_quantity: 1 },
      { location: { bucket: "production", department: "조립" }, work_reserved_quantity: 1, approval_reserved_quantity: 1, shipping_reserved_quantity: 0 },
    ], forecast_by_location: [],
  },
} as unknown as Item;

describe("대시보드 작업 예약 분포", () => {
  it("행에는 예약 수량을 쓰고 목록에는 사선과 미래 입고의 의미를 한 번 안내한다", () => {
    render(<InventoryItemsTable error={null} loading={false} filteredItems={[item]}
      displayLimit={100} setDisplayLimit={() => {}} selectedItem={null} onSelectItem={() => {}}
      activeFilterCount={0} hasKpiFilter={false} onRetry={() => {}} onResetAllFilters={() => {}} compact />);
    expect(screen.getByText("예약 7 EA")).toBeInTheDocument();
    expect(screen.getByText("사선은 예약된 수량입니다. 입고·생산 예정은 사용 가능 재고에 포함하지 않습니다.")).toBeInTheDocument();
  });

  it("실물 길이는 유지하고 각 위치에서 예약된 부분만 사선으로 표시한다", () => {
    render(<InventoryStockSummary item={item} mode="bar" showWorkReservations />);
    const bar = screen.getByRole("img", { name: /재고 분포/ });
    expect(bar.children[0]).toHaveStyle({ width: "50%" });
    expect(bar.children[1]).toHaveStyle({ width: "50%" });
    expect(bar.children[0].querySelector('[data-reservation-overlay]')).toHaveStyle({ width: "50%" });
    expect(bar.children[1].querySelector('[data-reservation-overlay]')).toHaveStyle({ width: "20%" });
    expect(bar).toHaveAttribute("aria-label", expect.stringContaining("예약 5"));
  });

  it("대시보드 행의 위치 배지에 현재 수량과 예약량을 함께 표시한다", () => {
    render(<table><tbody><InventoryItemRow item={item} selected={false} onSelect={() => {}} /></tbody></table>);
    const chips = screen.getByTestId("inventory-dept-stock-summary");
    expect(within(chips).getByText("창고 10").parentElement).toHaveTextContent(/창고 10\s*· 예약 5/);
    expect(within(chips).getByText("조립 10").parentElement).toHaveTextContent(/조립 10\s*· 예약 2/);
    expect(screen.getByTestId("inventory-total-stock")).toHaveTextContent("13");
  });

  it("실사 기본 소비자는 예약 패턴과 신규 배지를 켜지 않는다", () => {
    const { rerender } = render(<InventoryStockSummary item={item} />);
    expect(screen.getByText("창고 10")).toBeInTheDocument();
    expect(screen.queryByText(/예약/)).toBeNull();
    rerender(<InventoryStockSummary item={item} mode="bar" />);
    expect(document.querySelector('[data-reservation-overlay]')).toBeNull();
  });

  it("실재고 0인 결과품의 생산 예정을 표시하되 가용에 합산하지 않는다", () => {
    render(<table><tbody><InventoryItemRow item={{ ...item, quantity: 0, warehouse_qty: 0, available_quantity: 0, locations: [] }} selected={false} onSelect={() => {}} /></tbody></table>);
    expect(screen.getByText("입고·생산 예정 +8")).toBeInTheDocument();
    expect(screen.getByTestId("inventory-total-stock")).toHaveTextContent("0");
  });
});
