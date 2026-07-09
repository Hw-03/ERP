import { render, screen } from "@testing-library/react";
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
});
