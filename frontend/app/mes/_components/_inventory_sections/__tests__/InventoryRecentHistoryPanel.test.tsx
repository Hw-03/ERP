import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { InventoryOperation, Item } from "@/lib/api";

const testState = vi.hoisted(() => ({
  queryArgs: undefined as unknown,
  queryResult: {
    data: { items: [], nextCursor: null } as { items: InventoryOperation[]; nextCursor: string | null },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@/lib/queries/useInventoryOperationsQuery", () => ({
  useInventoryOperationsQuery: (...args: unknown[]) => {
    testState.queryArgs = args;
    return testState.queryResult;
  },
}));

import { InventoryRecentHistoryPanel } from "../InventoryRecentHistoryPanel";

function makeItem(): Item {
  return { item_id: "item-1", item_name: "테스트 품목", mes_code: "46-AA-0080", unit: "EA" } as Item;
}

function makeOperation(overrides: Partial<InventoryOperation> = {}): InventoryOperation {
  return {
    operationId: "operation-1",
    kind: "BUSINESS",
    domain: "inventory_io",
    action: "receive_supplier",
    displayLabel: "원자재 입고",
    effectiveStatus: "active",
    actorEmployeeId: "employee-1",
    actorName: "김작업",
    department: "조립",
    reason: null,
    effectiveAt: "2026-08-14T01:30:00Z",
    reversesOperationId: null,
    reversalOperationId: null,
    canCancel: true,
    cancelBlockers: [],
    lines: [],
    matchingLines: [{
      logId: "log-1",
      itemId: "item-1",
      itemName: "테스트 품목",
      mesCode: "46-AA-0080",
      transactionType: "RECEIVE",
      quantityChange: 12,
      quantityBefore: 3,
      quantityAfter: 15,
      transferQty: null,
      department: "조립",
      operationRole: "PRIMARY",
      reversesLogId: null,
      referenceNo: null,
      notes: null,
      createdAt: "2026-08-14T01:30:00Z",
    }],
    effects: [],
    ...overrides,
  };
}

describe("InventoryRecentHistoryPanel", () => {
  it("현재 품목의 최근 5건만 조회하고 거래 구분·수량·일시·업무 맥락을 표시한다", () => {
    testState.queryResult = { data: { items: [makeOperation()], nextCursor: null }, isLoading: false, isError: false, refetch: vi.fn() };
    render(<InventoryRecentHistoryPanel item={makeItem()} />);

    expect(testState.queryArgs).toEqual([{ itemId: "item-1", limit: 5 }]);
    expect(screen.getByText("원자재 입고")).toBeInTheDocument();
    expect(screen.getByText("+12 EA")).toBeInTheDocument();
    expect(screen.getByText("08/14 10:30")).toBeInTheDocument();
    expect(screen.getByText("조립 · 김작업")).toBeInTheDocument();
  });

  it("서버가 준 최신순을 유지하면서 최대 5건만 표시한다", () => {
    testState.queryResult = {
      data: {
        items: Array.from({ length: 6 }, (_, index) =>
          makeOperation({ operationId: `operation-${index + 1}`, actorName: `작업자 ${index + 1}` }),
        ),
        nextCursor: null,
      },
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
    testState.queryResult = { data: { items: [], nextCursor: null }, isLoading: false, isError: true, refetch };
    render(<InventoryRecentHistoryPanel item={makeItem()} />);

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("내역이 없을 때 빈 상태를 표시한다", () => {
    testState.queryResult = { data: { items: [], nextCursor: null }, isLoading: false, isError: false, refetch: vi.fn() };
    render(<InventoryRecentHistoryPanel item={makeItem()} />);

    expect(screen.getByText("최근 입출고 내역이 없습니다.")).toBeInTheDocument();
  });

  it("취소 작업을 별도 최근 행으로 정상 명도와 반대 수량으로 표시한다", () => {
    testState.queryResult = {
      data: {
        items: [makeOperation({
          operationId: "cancel-1",
          kind: "CANCELLATION",
          displayLabel: "부서 입출고 취소",
          effectiveStatus: "cancellation",
          matchingLines: [{
            ...makeOperation().matchingLines[0],
            logId: "cancel-log-1",
            transactionType: "SHIP",
            quantityChange: 7,
            reversesLogId: "original-log-1",
          }],
        })],
        nextCursor: null,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };

    render(<InventoryRecentHistoryPanel item={makeItem()} />);

    expect(screen.getByText("부서 입출고 취소")).toBeInTheDocument();
    expect(screen.getByText("+7 EA")).toBeInTheDocument();
    expect(screen.getByText("부서 입출고 취소").closest("li")).not.toHaveAttribute("data-cancelled");
  });

  it("부서 재고 작업의 내부 세부명 대신 현장 메뉴명으로 표시한다", () => {
    testState.queryResult = {
      data: {
        items: [
          makeOperation({
            operationId: "department-original",
            domain: "department_inventory",
            action: "correction",
            displayLabel: "수량 보정",
          }),
          makeOperation({
            operationId: "department-cancel",
            kind: "CANCELLATION",
            domain: "department_inventory",
            action: "correction",
            displayLabel: "수량 보정 취소",
            effectiveStatus: "cancellation",
          }),
        ],
        nextCursor: null,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };

    render(<InventoryRecentHistoryPanel item={makeItem()} />);

    expect(screen.getByText("부서 입출고")).toBeInTheDocument();
    expect(screen.getByText("부서 입출고 취소")).toBeInTheDocument();
    expect(screen.queryByText("수량 보정")).not.toBeInTheDocument();
  });

  it("취소된 원 작업은 작업명·수량·시각만 선택적으로 취소 표시한다", () => {
    testState.queryResult = {
      data: {
        items: [makeOperation({
          effectiveStatus: "cancelled",
          displayLabel: "부서 입출고",
          actorName: "원 작업자",
        })],
        nextCursor: null,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };

    render(<InventoryRecentHistoryPanel item={makeItem()} />);

    const row = screen.getByText("부서 입출고").closest("li");
    expect(row).toHaveAttribute("data-cancelled", "true");
    expect(screen.getByText("부서 입출고").parentElement).toHaveClass("inventory-recent-main");
    expect(screen.getByText("+12 EA")).toBeInTheDocument();
    expect(screen.getByText("08/14 10:30")).toBeInTheDocument();
    expect(screen.getByText("조립 · 원 작업자").parentElement).toHaveClass("inventory-recent-meta");
  });
});
