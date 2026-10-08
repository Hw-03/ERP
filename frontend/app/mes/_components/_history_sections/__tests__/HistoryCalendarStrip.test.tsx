import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TransactionLog } from "@/lib/api/types/production";
import { HistoryCalendarStrip } from "../HistoryCalendarStrip";

function makeLog(overrides: Partial<TransactionLog> = {}): TransactionLog {
  return {
    log_id: "log-1",
    item_id: "ITEM-1",
    mes_code: "AX-001",
    item_name: "AX-100",
    item_process_type_code: "AF",
    item_unit: "EA",
    transaction_type: "RECEIVE",
    quantity_change: 1,
    quantity_before: 0,
    quantity_after: 1,
    warehouse_qty_before: null,
    warehouse_qty_after: null,
    transfer_qty: 1,
    reference_no: null,
    produced_by: null,
    requester_name: null,
    approver_name: null,
    requested_at: "2026-07-01T01:00:00Z",
    approved_at: null,
    department: "조립",
    notes: null,
    operation_batch_id: null,
    created_at: "2026-07-01T01:00:00Z",
    edit_count: 0,
    cancelled: false,
    cancel_reason: null,
    cancelled_by: null,
    cancelled_at: null,
    inventory_effect: null,
    shipping_phase: null,
    ...overrides,
  };
}

describe("HistoryCalendarStrip", () => {
  it.each(["RECEIVE", "MATERIAL_OUT"] as const)("튜브 %s는 업체 거래도 창고 대신 부서 건수로 표시한다", (transactionType) => {
    const dayLogs = [makeLog({ transaction_type: transactionType, history_batch: { work_type: "tube_material", sub_type: transactionType === "RECEIVE" ? "tube_receive_supplier" : "tube_outbound_supplier" } })];
    render(<HistoryCalendarStrip calendarYear={2026} calendarMonth={6} prevMonth={vi.fn()} nextMonth={vi.fn()} setCalendarYear={vi.fn()} setCalendarMonth={vi.fn()} onSelectMonth={vi.fn()} calendarLoading={false} calendarDays={[1]} calendarDayMap={new Map([["2026-07-01", dayLogs]])} todayKey="2026-07-09" selectedDay={null} setSelectedDay={vi.fn()} />);
    expect(screen.getByText("부서 1건")).toBeInTheDocument();
    expect(screen.queryByText("창고 1건")).not.toBeInTheDocument();
  });
  it("batch 투영이 없는 튜브 위치 입고도 부서 건수로 표시한다", () => {
    const dayLogs = [makeLog({ department: "튜브", inventory_effect: [{ scope: "location", department: "튜브", status: "PRODUCTION", delta: 1 }] })];
    render(<HistoryCalendarStrip calendarYear={2026} calendarMonth={6} prevMonth={vi.fn()} nextMonth={vi.fn()} setCalendarYear={vi.fn()} setCalendarMonth={vi.fn()} onSelectMonth={vi.fn()} calendarLoading={false} calendarDays={[1]} calendarDayMap={new Map([["2026-07-01", dayLogs]])} todayKey="2026-07-09" selectedDay={null} setSelectedDay={vi.fn()} />);
    expect(screen.getByText("부서 1건")).toBeInTheDocument();
  });
  it("labels total daily count and exposes uncategorized remainder as 기타", () => {
    const dayLogs = [
      makeLog({ log_id: "receive", transaction_type: "RECEIVE" }),
      makeLog({ log_id: "produce", transaction_type: "PRODUCE" }),
      makeLog({ log_id: "adjust", transaction_type: "ADJUST" }),
      makeLog({ log_id: "return", transaction_type: "SUPPLIER_RETURN" }),
    ];

    render(
      <HistoryCalendarStrip
        calendarYear={2026}
        calendarMonth={6}
        prevMonth={vi.fn()}
        nextMonth={vi.fn()}
        setCalendarYear={vi.fn()}
        setCalendarMonth={vi.fn()}
        onSelectMonth={vi.fn()}
        calendarLoading={false}
        calendarDays={[1]}
        calendarDayMap={new Map([["2026-07-01", dayLogs]])}
        todayKey="2026-07-09"
        selectedDay={null}
        setSelectedDay={vi.fn()}
      />,
    );

    expect(screen.getByText("총 4건")).toBeInTheDocument();
    expect(screen.getByText("기타 1건")).toBeInTheDocument();
  });

  it("gives the month label a bordered keyboard-focusable control and selects a year-card month", () => {
    const onSelectMonth = vi.fn();
    render(
      <HistoryCalendarStrip
        calendarYear={2026}
        calendarMonth={6}
        prevMonth={vi.fn()}
        nextMonth={vi.fn()}
        setCalendarYear={vi.fn()}
        setCalendarMonth={vi.fn()}
        onSelectMonth={onSelectMonth}
        calendarLoading={false}
        calendarDays={[1]}
        calendarDayMap={new Map()}
        todayKey="2026-07-09"
        selectedDay={null}
        setSelectedDay={vi.fn()}
      />,
    );

    const monthLabel = screen.getByRole("button", { name: "2026년 7월 — 연 뷰 열기" });
    expect(monthLabel).toHaveClass("border", "focus-visible:outline-none", "focus-visible:ring-2");

    fireEvent.click(monthLabel);
    fireEvent.click(screen.getByRole("button", { name: "2026년 8월 — 0건" }));
    expect(onSelectMonth).toHaveBeenCalledWith({ year: 2026, month: 7 });
  });
});
