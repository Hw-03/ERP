import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Item, TransactionLog } from "@/lib/api";

const testState = vi.hoisted(() => ({
  queryArgs: undefined as unknown,
  queryResult: {
    data: [] as TransactionLog[],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@/lib/queries/useTransactionsQuery", () => ({
  useTransactionsQuery: (...args: unknown[]) => {
    testState.queryArgs = args;
    return testState.queryResult;
  },
}));

import { InventoryRecentHistoryPanel } from "../InventoryRecentHistoryPanel";

function makeItem(): Item {
  return { item_id: "item-1", item_name: "테스트 품목", mes_code: "46-AA-0080", unit: "EA" } as Item;
}

function makeLog(overrides: Partial<TransactionLog> = {}): TransactionLog {
  return {
    log_id: "log-1",
    item_id: "item-1",
    mes_code: "46-AA-0080",
    item_name: "테스트 품목",
    item_process_type_code: null,
    item_unit: "EA",
    transaction_type: "RECEIVE",
    quantity_change: 12,
    quantity_before: 3,
    quantity_after: 15,
    warehouse_qty_before: 3,
    warehouse_qty_after: 15,
    transfer_qty: null,
    reference_no: null,
    produced_by: null,
    requester_name: "김작업",
    approver_name: null,
    department: "조립",
    notes: null,
    operation_batch_id: null,
    created_at: "2026-08-14T01:30:00Z",
    cancelled: false,
    cancel_reason: null,
    cancelled_by: null,
    cancelled_at: null,
    ...overrides,
  };
}

describe("InventoryRecentHistoryPanel", () => {
  it("현재 품목의 최근 5건만 조회하고 거래 구분·수량·일시·업무 맥락을 표시한다", () => {
    testState.queryResult = { data: [makeLog()], isLoading: false, isError: false, refetch: vi.fn() };
    render(<InventoryRecentHistoryPanel item={makeItem()} />);

    expect(testState.queryArgs).toEqual([{ itemId: "item-1", limit: 5 }]);
    expect(screen.getByText("원자재 입고")).toBeInTheDocument();
    expect(screen.getByText("+12 EA")).toBeInTheDocument();
    expect(screen.getByText("08/14 10:30")).toBeInTheDocument();
    expect(screen.getByText("조립 · 김작업")).toBeInTheDocument();
  });

  it("서버가 준 최신순을 유지하면서 최대 5건만 표시한다", () => {
    testState.queryResult = {
      data: Array.from({ length: 6 }, (_, index) =>
        makeLog({ log_id: `log-${index + 1}`, requester_name: `작업자 ${index + 1}` }),
      ),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };

    render(<InventoryRecentHistoryPanel item={makeItem()} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("조립 · 작업자 1")).toBeInTheDocument();
    expect(screen.getByText("조립 · 작업자 5")).toBeInTheDocument();
    expect(screen.queryByText("조립 · 작업자 6")).not.toBeInTheDocument();
  });

  it("조회 실패를 알리고 재시도한다", () => {
    const refetch = vi.fn();
    testState.queryResult = { data: [], isLoading: false, isError: true, refetch };
    render(<InventoryRecentHistoryPanel item={makeItem()} />);

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("내역이 없을 때 빈 상태를 표시한다", () => {
    testState.queryResult = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
    render(<InventoryRecentHistoryPanel item={makeItem()} />);

    expect(screen.getByText("최근 입출고 내역이 없습니다.")).toBeInTheDocument();
  });
});
