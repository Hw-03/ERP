import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryOperation, Item, TransactionLog } from "@/lib/api";

const testState = vi.hoisted(() => ({
  queryArgs: undefined as unknown,
  legacyQueryArgs: undefined as unknown,
  queryResult: {
    data: { items: [], nextCursor: null } as { items: InventoryOperation[]; nextCursor: string | null },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  legacyQueryResult: {
    data: [] as TransactionLog[],
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

vi.mock("@/lib/queries/useTransactionsQuery", () => ({
  useTransactionsQuery: (...args: unknown[]) => {
    testState.legacyQueryArgs = args;
    return testState.legacyQueryResult;
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
    cancelWarnings: [],
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

function makeLegacyLog(overrides: Partial<TransactionLog> = {}): TransactionLog {
  return {
    log_id: "legacy-log-1",
    item_id: "item-1",
    mes_code: "46-AA-0080",
    item_name: "테스트 품목",
    item_process_type_code: null,
    item_unit: "EA",
    transaction_type: "SHIP",
    quantity_change: -50,
    quantity_before: 50,
    quantity_after: 0,
    warehouse_qty_before: 50,
    warehouse_qty_after: 0,
    transfer_qty: null,
    reference_no: null,
    produced_by: "김민재",
    requester_name: null,
    approver_name: null,
    department: "조립",
    notes: null,
    operation_batch_id: null,
    operation_id: null,
    created_at: "2026-07-28T04:51:00Z",
    cancelled: false,
    cancel_reason: null,
    cancelled_by: null,
    cancelled_at: null,
    ...overrides,
  } as TransactionLog;
}

describe("InventoryRecentHistoryPanel", () => {
  beforeEach(() => {
    testState.queryArgs = undefined;
    testState.legacyQueryArgs = undefined;
    testState.queryResult = {
      data: { items: [], nextCursor: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    testState.legacyQueryResult = {
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
  });

  it("원장과 기존 거래 사이를 제목 없이 구분선으로 나눈다", () => {
    testState.queryResult = { data: { items: [makeOperation()], nextCursor: null }, isLoading: false, isError: false, refetch: vi.fn() };
    testState.legacyQueryResult = { data: [makeLegacyLog()], isLoading: false, isError: false, refetch: vi.fn() };

    const { container } = render(<InventoryRecentHistoryPanel item={makeItem()} />);

    expect(screen.queryByText("원장 작업 내역")).not.toBeInTheDocument();
    expect(screen.queryByText("기존 입출고 내역")).not.toBeInTheDocument();
    expect(container.querySelector(".inventory-recent-divider")).not.toBeNull();
    expect(screen.getByText("50 EA")).toBeInTheDocument();
    expect(screen.getByText("조립 · 김민재")).toBeInTheDocument();
    expect(testState.legacyQueryArgs).toEqual([{ itemId: "item-1", unlinkedOnly: true, limit: 5 }]);
  });

  it("기존 거래만 있으면 구분선 없이 표시한다", () => {
    testState.legacyQueryResult = { data: [makeLegacyLog()], isLoading: false, isError: false, refetch: vi.fn() };

    const { container } = render(<InventoryRecentHistoryPanel item={makeItem()} />);

    expect(container.querySelector(".inventory-recent-divider")).toBeNull();
  });

  it("현재 품목의 최근 5건만 조회하고 거래 구분·수량·일시·업무 맥락을 표시한다", () => {
    testState.queryResult = { data: { items: [makeOperation()], nextCursor: null }, isLoading: false, isError: false, refetch: vi.fn() };
    render(<InventoryRecentHistoryPanel item={makeItem()} />);

    expect(testState.queryArgs).toEqual([{ itemId: "item-1", limit: 5 }]);
    expect(screen.getByText("원자재 입고")).toBeInTheDocument();
    expect(screen.getByText("12 EA")).toBeInTheDocument();
    expect(screen.getByText("08/14 10:30")).toBeInTheDocument();
    expect(screen.getByText("조립 · 김작업")).toBeInTheDocument();
    expect(screen.queryByText("원장 작업 내역")).not.toBeInTheDocument();
    expect(screen.queryByText("기존 입출고 내역")).not.toBeInTheDocument();
  });

  it("부서 이동은 실제 작업명과 이동 수량으로 표시한다", () => {
    testState.queryResult = {
      data: {
        items: [makeOperation({
          action: "dept_transfer",
          displayLabel: "dept_transfer",
          matchingLines: [{
            ...makeOperation().matchingLines[0],
            transactionType: "TRANSFER_DEPT",
            quantityChange: 0,
            transferQty: 30,
          }],
        })],
        nextCursor: null,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };

    render(<InventoryRecentHistoryPanel item={makeItem()} />);

    expect(screen.getByText("부서 이동")).toBeInTheDocument();
    expect(screen.getByText("30 EA")).toBeInTheDocument();
    expect(screen.getByText("조립 · 김작업")).toBeInTheDocument();
    expect(screen.getByText("08/14 10:30")).toBeInTheDocument();
    expect(screen.queryByText("부서 입출고")).not.toBeInTheDocument();
    expect(screen.queryByText("0 EA")).not.toBeInTheDocument();
  });

  it("기존 이력도 포괄 분류 대신 실제 처리 작업과 수량을 표시한다", () => {
    testState.legacyQueryResult = {
      data: [makeLegacyLog({ transaction_type: "BACKFLUSH", quantity_change: -60 })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };

    render(<InventoryRecentHistoryPanel item={makeItem()} />);

    expect(screen.getByText("자동 차감")).toBeInTheDocument();
    expect(screen.getByText("60 EA")).toBeInTheDocument();
    expect(screen.queryByText("부서 입출고")).not.toBeInTheDocument();
    expect(screen.queryByText("-60 EA")).not.toBeInTheDocument();
  });

  it("기존 이동 이력은 자동 기록된 수량으로 0 대신 실제 이동량을 표시한다", () => {
    testState.legacyQueryResult = {
      data: [makeLegacyLog({
        transaction_type: "TRANSFER_TO_PROD",
        quantity_change: 0,
        transfer_qty: null,
        notes: "요청 승인 처리: SR-001 / 창고 → 조립 이동 / 30.0000개 / 요청자 김민재",
      })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };

    render(<InventoryRecentHistoryPanel item={makeItem()} />);

    expect(screen.getByText("창고 → 부서 이동")).toBeInTheDocument();
    expect(screen.getByText("30 EA")).toBeInTheDocument();
    expect(screen.queryByText("0 EA")).not.toBeInTheDocument();
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
    const legacyRefetch = vi.fn();
    testState.queryResult = { data: { items: [], nextCursor: null }, isLoading: false, isError: true, refetch };
    testState.legacyQueryResult = { data: [], isLoading: false, isError: false, refetch: legacyRefetch };
    render(<InventoryRecentHistoryPanel item={makeItem()} />);

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(legacyRefetch).toHaveBeenCalledOnce();
  });

  it("내역이 없을 때 빈 상태를 표시한다", () => {
    testState.queryResult = { data: { items: [], nextCursor: null }, isLoading: false, isError: false, refetch: vi.fn() };
    render(<InventoryRecentHistoryPanel item={makeItem()} />);

    expect(screen.getByText("최근 입출고 내역이 없습니다.")).toBeInTheDocument();
  });

  it("취소 작업을 별도 최근 행으로 실제 작업명과 처리 수량으로 표시한다", () => {
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

    expect(screen.getByText("원자재 입고 취소")).toBeInTheDocument();
    expect(screen.getByText("7 EA")).toBeInTheDocument();
    expect(screen.getByText("원자재 입고 취소").closest("li")).not.toHaveAttribute("data-cancelled");
  });

  it("부서 재고 보정은 실제 작업명으로 표시한다", () => {
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

    expect(screen.getByText("수량 보정")).toBeInTheDocument();
    expect(screen.getByText("수량 보정 취소")).toBeInTheDocument();
  });

  it("원장 입출고 조정은 실제 세부 작업명으로 표시한다", () => {
    testState.queryResult = {
      data: {
        items: [
          makeOperation({
            operationId: "io-adjust-original",
            action: "adjust_in",
            displayLabel: "adjust_in",
          }),
          makeOperation({
            operationId: "io-adjust-cancel",
            kind: "CANCELLATION",
            action: "adjust_in",
            displayLabel: "adjust_in",
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

    expect(screen.getByText("수량보정 입고")).toBeInTheDocument();
    expect(screen.getByText("수량보정 입고 취소")).toBeInTheDocument();
    expect(screen.queryByText("adjust_in")).not.toBeInTheDocument();
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

    const row = screen.getByText("원자재 입고").closest("li");
    expect(row).toHaveAttribute("data-cancelled", "true");
    expect(screen.getByText("원자재 입고").parentElement).toHaveClass("inventory-recent-main");
    expect(screen.getByText("12 EA")).toBeInTheDocument();
    expect(screen.getByText("08/14 10:30")).toBeInTheDocument();
    expect(screen.getByText("조립 · 원 작업자").parentElement).toHaveClass("inventory-recent-meta");
  });
});
