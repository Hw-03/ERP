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
    reservation_by_requester_department: [
      { requester_department: "튜브", work_reserved_quantity: 3, approval_reserved_quantity: 1, shipping_reserved_quantity: 0 },
      { requester_department: "조립", work_reserved_quantity: 1, approval_reserved_quantity: 1, shipping_reserved_quantity: 0 },
      { requester_department: null, work_reserved_quantity: 0, approval_reserved_quantity: 0, shipping_reserved_quantity: 1 },
    ],
    reservation_by_location: [
      { location: { bucket: "warehouse", department: null }, work_reserved_quantity: 3, approval_reserved_quantity: 1, shipping_reserved_quantity: 1 },
      { location: { bucket: "production", department: "조립" }, work_reserved_quantity: 1, approval_reserved_quantity: 1, shipping_reserved_quantity: 0 },
    ], forecast_by_location: [{ location: { bucket: "production", department: "조립" }, expected_in_quantity: 8,
      expected_out_quantity: 4, transfer_in_quantity: 0, transfer_out_quantity: 0 }],
  },
} as unknown as Item;

describe("대시보드 작업 예약 분포", () => {
  it.each([false, true])("가용과 예약 배지를 보관 위치별로 표시한다 (compact=%s)", (compact) => {
    const reserved = { ...item, department: "튜닝", work_reservations: { ...item.work_reservations!,
      reservation_by_requester_department: [
        { requester_department: "조립", work_reserved_quantity: 4, approval_reserved_quantity: 2, shipping_reserved_quantity: 0 },
        { requester_department: null, work_reserved_quantity: 0, approval_reserved_quantity: 0, shipping_reserved_quantity: 1 },
      ],
    } } as Item;
    render(<table><tbody><InventoryItemRow item={reserved} compact={compact} selected={false} onSelect={() => {}} /></tbody></table>);
    const group = screen.getByRole("group", { name: "부서별 가용·예약 재고" });
    expect(within(group).getByText("창고 가용 5")).toBeInTheDocument();
    expect(within(group).getByText("창고 예약 5")).toBeInTheDocument();
    expect(within(group).getByText("조립 가용 8")).toBeInTheDocument();
    expect(within(group).getByText("조립 예약 2")).toBeInTheDocument();
    expect(within(group).queryByText(/튜닝|출하/)).toBeNull();
    expect(group.children).toHaveLength(2);
    expect(screen.getByRole("img", { name: /재고 분포/ })).toHaveAttribute("title", "창고 실재고 10 · 가용 5 · 예약 5 / 조립 실재고 10 · 가용 8 · 예약 2");
    expect(screen.getByTestId("inventory-total-stock")).toHaveTextContent("13");
  });

  it("예약자 부서 집계가 없어도 보관 위치로 가용과 예약을 표시한다", () => {
    render(<InventoryStockSummary item={{ ...item, work_reservations: { ...item.work_reservations!, reservation_by_requester_department: undefined } }} showWorkReservations />);
    expect(screen.getByText("창고 예약 5")).toBeInTheDocument();
    expect(screen.getByText("조립 예약 2")).toBeInTheDocument();
    expect(screen.queryByText(/위치 미확인/)).toBeNull();
  });

  it("예약자 부서가 없어도 작업·승인·출하 예약을 실제 출발 위치에 합산한다", () => {
    render(<InventoryStockSummary item={{ ...item, work_reservations: { ...item.work_reservations!,
      reservation_by_requester_department: [
        { requester_department: "조립", work_reserved_quantity: 3, approval_reserved_quantity: 0, shipping_reserved_quantity: 0 },
        { requester_department: null, work_reserved_quantity: 1, approval_reserved_quantity: 2, shipping_reserved_quantity: 1 },
      ],
    } }} showWorkReservations />);
    expect(screen.getByText("조립 예약 2")).toBeInTheDocument();
    expect(screen.getByText("창고 예약 5")).toBeInTheDocument();
    expect(screen.queryByText(/위치 미확인|출하 예약/)).toBeNull();
  });

  it("실물 튜브 214에서 예약 60을 빼고 가용 154와 사용 가능 재고를 보존한다", () => {
    const electrode = { ...item, quantity: 214, warehouse_qty: 0, available_quantity: 154,
      locations: [{ department: "튜브", status: "PRODUCTION", quantity: 214 }],
      work_reservations: { ...item.work_reservations!, work_reserved_quantity: 60, approval_reserved_quantity: 0, shipping_reserved_quantity: 0,
        reservation_by_requester_department: [{ requester_department: "조립", work_reserved_quantity: 60, approval_reserved_quantity: 0, shipping_reserved_quantity: 0 }],
        reservation_by_location: [{ location: { bucket: "production" as const, department: "튜브" }, work_reserved_quantity: 60, approval_reserved_quantity: 0, shipping_reserved_quantity: 0 }] } } as Item;
    render(<table><tbody><InventoryItemRow item={electrode} compact selected={false} onSelect={() => {}} /></tbody></table>);
    expect(screen.getByRole("group", { name: "튜브 재고" })).toHaveTextContent("튜브 가용 154");
    expect(screen.getByText("튜브 예약 60")).toHaveClass("text-xs", "font-bold", "rounded-full", "border");
    expect(screen.getByText("튜브 예약 60")).toHaveStyle({ background: "var(--c-s3)", color: "var(--c-muted2)" });
    expect(screen.getByText("튜브 예약 60").style.borderColor).toBe("var(--c-border)");
    expect(screen.getByTestId("inventory-total-stock")).toHaveTextContent("154");
    expect(screen.getByRole("img", { name: /재고 분포/ }).children[0]).toHaveStyle({ width: "100%" });
  });
  it("모바일 행은 보관 위치별 가용·예약을 표시하고 합계를 반복하지 않는다", () => {
    render(<InventoryItemsTable error={null} loading={false} filteredItems={[item]}
      displayLimit={100} setDisplayLimit={() => {}} selectedItem={null} onSelectItem={() => {}}
      activeFilterCount={0} hasKpiFilter={false} onRetry={() => {}} onResetAllFilters={() => {}} compact />);
    expect(screen.getByText("창고 가용 5")).toBeInTheDocument();
    expect(screen.getByText("창고 예약 5")).toBeInTheDocument();
    expect(screen.getByText("조립 예약 2")).toBeInTheDocument();
    expect(screen.queryByText("예약 7 EA")).toBeNull();
    expect(screen.queryByText(/사선은 예약된/)).toBeNull();
    expect(screen.queryByText(/입고·생산 예정/)).toBeNull();
  });

  it("실물 길이와 부서 색을 유지하며 위치별 예약 비율을 사선으로 표시한다", () => {
    render(<InventoryStockSummary item={item} mode="bar" showWorkReservations />);
    const bar = screen.getByRole("img", { name: /재고 분포/ });
    expect(bar.children[0]).toHaveStyle({ width: "50%", backgroundColor: "var(--c-green)" });
    expect(bar.children[1]).toHaveStyle({ width: "50%", backgroundColor: "var(--c-blue)" });
    const overlays = bar.querySelectorAll('[data-reservation-overlay]');
    expect(overlays).toHaveLength(2);
    expect(overlays[0]).toHaveStyle({ width: "50%" });
    expect(overlays[1]).toHaveStyle({ width: "20%" });
    expect((overlays[0] as HTMLElement).style.backgroundImage).toContain("repeating-linear-gradient");
    expect(bar).toHaveAttribute("title", "창고 실재고 10 · 가용 5 · 예약 5 / 조립 실재고 10 · 가용 8 · 예약 2");
    expect(bar).toHaveAttribute("aria-label", expect.stringContaining("예약 2"));
  });

  it.each([false, true])("출하 재고가 전량 예약되면 막대 전체를 예약으로 표시한다 (compact=%s)", (compact) => {
    const shippingItem = { ...item, quantity: 2, warehouse_qty: 0, available_quantity: 0,
      locations: [{ department: "출하", status: "PRODUCTION", quantity: 2 }],
      work_reservations: { ...item.work_reservations!, work_reserved_quantity: 0, approval_reserved_quantity: 0, shipping_reserved_quantity: 2,
        reservation_by_requester_department: [],
        reservation_by_location: [{ location: { bucket: "production" as const, department: "출하" }, work_reserved_quantity: 0, approval_reserved_quantity: 0, shipping_reserved_quantity: 2 }] } } as Item;
    render(<table><tbody><InventoryItemRow item={shippingItem} compact={compact} selected={false} onSelect={() => {}} /></tbody></table>);
    const bar = screen.getByRole("img", { name: /재고 분포/ });
    expect(bar.children[0]).toHaveStyle({ width: "100%" });
    expect(bar.querySelector('[data-reservation-overlay]')).toHaveStyle({ width: "100%" });
    expect(bar).toHaveAttribute("aria-label", "재고 분포: 출하 실재고 2 · 가용 0 · 예약 2 100%");
    expect(screen.getByText("출하 가용 0")).toBeInTheDocument();
    expect(screen.getByTestId("inventory-total-stock")).toHaveTextContent("0");
    expect(screen.getByText("출하 예약 2")).toBeInTheDocument();
    expect(screen.queryByText(/부서 미확인 예약/)).toBeNull();
  });

  it("예약이 없는 위치와 관리 재고에는 예약 무늬를 표시하지 않는다", () => {
    render(<InventoryStockSummary item={{ ...item, quantity: 22,
      locations: [...item.locations!, { department: "조립", status: "DEFECTIVE", quantity: 2 }],
      work_reservations: { ...item.work_reservations!, reservation_by_location: [] } } as Item} mode="bar" showWorkReservations />);
    const bar = screen.getByRole("img", { name: /재고 분포/ });
    expect(bar.querySelector('[data-reservation-overlay]')).toBeNull();
    expect(bar).not.toHaveAttribute("aria-label", expect.stringContaining("예약"));
    expect(bar.querySelector('[data-stock-category="DEFECT"]')).toBeInTheDocument();
  });

  it("가용과 예약은 위치별로 묶고 입고 예정은 분리하며 예약은 중립 색으로 표시한다", () => {
    render(<table><tbody><InventoryItemRow item={item} selected={false} onSelect={() => {}} /></tbody></table>);
    const chips = screen.getAllByTestId("inventory-dept-stock-summary")[0];
    const physical = within(chips).getByRole("group", { name: "부서별 가용·예약 재고" });
    const warehouse = within(physical).getByRole("group", { name: "창고 재고" });
    const incoming = within(chips).getByRole("group", { name: "입고 예정" });
    expect(warehouse).toHaveTextContent("창고 가용 5");
    expect(warehouse).toHaveTextContent("창고 예약 5");
    expect(physical.compareDocumentPosition(incoming) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(chips).getByText("창고 예약 5")).toHaveStyle({ color: "var(--c-muted2)" });
    expect(within(physical).getByText("조립 가용 8")).toBeInTheDocument();
    expect(incoming).toHaveTextContent("조립 입고 예정 8");
    expect(screen.getByTestId("inventory-total-stock")).toHaveTextContent("13");
  });

  it("실사 기본 소비자는 예약 패턴과 신규 배지를 켜지 않는다", () => {
    const { rerender } = render(<InventoryStockSummary item={item} />);
    expect(screen.getByText("창고 10")).toBeInTheDocument();
    expect(screen.queryByText(/예약/)).toBeNull();
    expect(screen.queryByText(/입고 예정/)).toBeNull();
    rerender(<InventoryStockSummary item={item} mode="bar" />);
    expect(document.querySelector('[data-reservation-overlay]')).toBeNull();
    expect(screen.queryByRole("img", { name: "입고 예정 있음" })).toBeNull();
  });

  it.each([false, true])("입고 표식은 현재고·예약 막대와 분리하고 예정 0이면 숨긴다 (compact=%s)", (compact) => {
    const { rerender } = render(<InventoryStockSummary item={item} compact={compact} mode="bar" showWorkReservations />);
    const bar = screen.getByRole("img", { name: /재고 분포/ });
    expect(screen.getByRole("img", { name: "입고 예정 있음" })).toBeInTheDocument();
    expect(bar).not.toContainElement(screen.getByRole("img", { name: "입고 예정 있음" }));
    expect(bar.children[0]).toHaveStyle({ width: "50%" });
    expect(bar.children[1]).toHaveStyle({ width: "50%" });
    rerender(<InventoryStockSummary item={{ ...item, work_reservations: { ...item.work_reservations!, expected_in_quantity: 0, transfer_in_quantity: 10 } }} compact={compact} mode="bar" showWorkReservations />);
    expect(screen.queryByRole("img", { name: "입고 예정 있음" })).toBeNull();
  });

  it("실재고 0인 결과품도 목록에서 예정 문구를 반복하거나 가용에 합산하지 않는다", () => {
    render(<table><tbody><InventoryItemRow item={{ ...item, quantity: 0, warehouse_qty: 0, available_quantity: 0, locations: [] }} selected={false} onSelect={() => {}} /></tbody></table>);
    expect(screen.queryByText("입고·생산 예정 +8")).toBeNull();
    expect(screen.getByTestId("inventory-total-stock")).toHaveTextContent("0");
    const summary = screen.getByTestId("inventory-dept-stock-summary");
    expect(within(summary).getByText("조립 입고 예정 8")).toBeInTheDocument();
    expect(within(summary).queryByText("-")).toBeNull();
  });

  it("현재고가 없어도 위치별 예약을 보존하고 단위가 없으면 임의 단위를 붙이지 않는다", () => {
    render(<InventoryStockSummary item={{ ...item, unit: undefined, quantity: 0, warehouse_qty: 0, locations: [] }} showWorkReservations />);
    expect(screen.getByText("창고 가용 0")).toBeInTheDocument();
    expect(screen.getByText("창고 예약 5")).toBeInTheDocument();
    expect(screen.getByText("조립 예약 2")).toBeInTheDocument();
    expect(screen.getByText("조립 입고 예정 8")).toBeInTheDocument();
    expect(screen.queryByText(/EA/)).toBeNull();
    expect(screen.queryByText("-")).toBeNull();
  });

  it("입고 예정은 담당자나 품목 부서가 아닌 실제 도착 위치별로 나누고 이동 예정은 섞지 않는다", () => {
    const forecast = (bucket: "warehouse" | "production" | "defective", department: string | null, quantity: number) => ({
      location: bucket === "warehouse" ? { bucket, department: null } as const : { bucket, department: department! },
      expected_in_quantity: quantity, expected_out_quantity: 0, transfer_in_quantity: 10, transfer_out_quantity: 0,
    });
    render(<InventoryStockSummary item={{ ...item, department: "품질", work_reservations: { ...item.work_reservations!, expected_in_quantity: 20,
      forecast_by_location: [forecast("warehouse", null, 5), forecast("production", "출하", 12), forecast("defective", "튜브", 3)] } }} showWorkReservations />);
    expect(screen.getByText("창고 입고 예정 5")).toBeInTheDocument();
    expect(screen.getByText("출하 입고 예정 12")).toBeInTheDocument();
    expect(screen.getByText("튜브 [불량] 입고 예정 3")).toBeInTheDocument();
    expect(screen.queryByText(/품질 입고 예정|입고 예정 20/)).toBeNull();
  });
});
