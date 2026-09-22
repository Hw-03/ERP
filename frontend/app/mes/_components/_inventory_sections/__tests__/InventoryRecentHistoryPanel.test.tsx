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
  legacyQueryResult: { data: [] as TransactionLog[], isLoading: false, isError: false, refetch: vi.fn() },
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

function makeLog(overrides: Partial<TransactionLog> = {}): TransactionLog {
  return {
    log_id: "log-1", item_id: "item-1", mes_code: "46-AA-0080", item_name: "테스트 품목", item_process_type_code: null,
    item_unit: "EA", transaction_type: "RECEIVE", quantity_change: 12, quantity_before: 15, quantity_after: 27,
    warehouse_qty_before: 15, warehouse_qty_after: 27, department_qty_before: 4, department_qty_after: 4,
    transfer_qty: null, reference_no: null, produced_by: "김작업", requester_name: null, approver_name: null,
    department: "조립", notes: null, operation_batch_id: null, operation_id: "operation-1", created_at: "2026-08-14T01:30:00Z",
    cancelled: false, cancel_reason: null, cancelled_by: null, cancelled_at: null, ...overrides,
  } as TransactionLog;
}

function makeOperation(overrides: Partial<InventoryOperation> = {}): InventoryOperation {
  const log = makeLog();
  return {
    operationId: "operation-1", kind: "BUSINESS", domain: "inventory_io", action: "receive_supplier", displayLabel: "원자재 입고",
    effectiveStatus: "active", actorEmployeeId: "employee-1", actorName: "김작업", department: "조립", reason: null,
    effectiveAt: "2026-08-14T01:30:00Z", reversesOperationId: null, reversalOperationId: null, canCancel: true, cancelBlockers: [], lines: [],
    matchingLines: [{
      logId: log.log_id, itemId: log.item_id, itemName: log.item_name, mesCode: log.mes_code, transactionType: log.transaction_type,
      quantityChange: log.quantity_change, quantityBefore: log.quantity_before, quantityAfter: log.quantity_after, transferQty: log.transfer_qty,
      department: log.department, operationRole: "PRIMARY", reversesLogId: null, referenceNo: null, notes: null, createdAt: log.created_at, historyLog: log,
    }],
    effects: [], ...overrides,
  };
}

describe("InventoryRecentHistoryPanel", () => {
  beforeEach(() => {
    testState.queryArgs = undefined;
    testState.legacyQueryArgs = undefined;
    testState.queryResult = { data: { items: [], nextCursor: null }, isLoading: false, isError: false, refetch: vi.fn() };
    testState.legacyQueryResult = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
  });

  it("이력 표와 같은 배지 분류로 창고 이동·불량·출하·취소를 표시한다", () => {
    testState.queryResult = {
      data: { items: [
        makeOperation({ matchingLines: [{ ...makeOperation().matchingLines[0], historyLog: makeLog({ transaction_type: "TRANSFER_TO_PROD" }) }] }),
        makeOperation({ operationId: "defect", matchingLines: [{ ...makeOperation().matchingLines[0], historyLog: makeLog({ log_id: "defect-log", transaction_type: "MARK_DEFECTIVE" }) }] }),
        makeOperation({ operationId: "shipping", matchingLines: [{ ...makeOperation().matchingLines[0], historyLog: makeLog({ log_id: "ship-log", transaction_type: "SHIP" }) }] }),
        makeOperation({ operationId: "cancel", kind: "CANCELLATION", effectiveStatus: "cancellation", matchingLines: [{ ...makeOperation().matchingLines[0], historyLog: makeLog({ log_id: "cancel-log", transaction_type: "TRANSFER_TO_WH", operation_kind: "CANCELLATION" }) }] }),
      ], nextCursor: null },
      isLoading: false, isError: false, refetch: vi.fn(),
    };
    render(<InventoryRecentHistoryPanel item={makeItem()} />);
    expect(screen.getByText("창고 입출고")).toBeInTheDocument();
    expect(screen.getByText("불량")).toBeInTheDocument();
    expect(screen.getByText("출하")).toBeInTheDocument();
    expect(screen.getByText("창고 입출고 취소")).toBeInTheDocument();
    expect(screen.queryByText("TRANSFER_TO_PROD")).not.toBeInTheDocument();
  });

  it("한 작업 그룹의 모든 선택 품목 라인과 각 위치 재고 변동을 표시한다", () => {
    const first = makeLog({ log_id: "line-1", warehouse_qty_before: 15, warehouse_qty_after: 27 });
    const second = makeLog({ log_id: "line-2", transaction_type: "TRANSFER_DEPT", warehouse_qty_before: 27, warehouse_qty_after: 27, department_qty_before: 4, department_qty_after: 9 });
    testState.queryResult = { data: { items: [makeOperation({ matchingLines: [
      { ...makeOperation().matchingLines[0], logId: first.log_id, historyLog: first },
      { ...makeOperation().matchingLines[0], logId: second.log_id, historyLog: second },
    ] })], nextCursor: null }, isLoading: false, isError: false, refetch: vi.fn() };
    render(<InventoryRecentHistoryPanel item={makeItem()} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByLabelText("재고 변동: 창고 15 +12→27")).toBeInTheDocument();
    expect(screen.getByLabelText("재고 변동: 조립 4 +5→9")).toBeInTheDocument();
  });

  it("이력 로그의 배치 투영으로 분해 작업을 이력 표와 같은 메뉴명으로 표시한다", () => {
    const log = makeLog({
      transaction_type: "PRODUCE",
      history_batch: { work_type: "process", sub_type: "disassemble", to_department: "조립" },
    });
    testState.queryResult = { data: { items: [makeOperation({ matchingLines: [{ ...makeOperation().matchingLines[0], historyLog: log }] })], nextCursor: null }, isLoading: false, isError: false, refetch: vi.fn() };

    render(<InventoryRecentHistoryPanel item={makeItem()} />);

    expect(screen.getByText("분해 출고")).toBeInTheDocument();
    expect(screen.queryByText("생산 입고")).not.toBeInTheDocument();
  });

  it("이력 로그가 없는 기존 응답에서는 재고 수치를 만들어내지 않고 기타 작업으로 표시한다", () => {
    testState.queryResult = { data: { items: [makeOperation({ displayLabel: "adjust_in", action: "adjust_in", matchingLines: [{ ...makeOperation().matchingLines[0], historyLog: null }] })], nextCursor: null }, isLoading: false, isError: false, refetch: vi.fn() };
    render(<InventoryRecentHistoryPanel item={makeItem()} />);
    expect(screen.getByText("기타 작업")).toBeInTheDocument();
    expect(screen.getByText("기록 없음")).toBeInTheDocument();
    expect(screen.queryByText("12 EA")).not.toBeInTheDocument();
  });

  it("계산 불가와 변동 없음을 이력 표와 같은 규칙으로 표시한다", () => {
    const unavailable = makeLog({ log_id: "unavailable", request_order_stock: { status: "unavailable", reason: "ambiguous_order", warehouse_qty_before: null, warehouse_qty_after: null, department_qty_before: null, department_qty_after: null } });
    const unchanged = makeLog({ log_id: "unchanged", warehouse_qty_after: 15, department_qty_after: 4 });
    testState.queryResult = { data: { items: [makeOperation({ matchingLines: [
      { ...makeOperation().matchingLines[0], logId: unavailable.log_id, historyLog: unavailable },
      { ...makeOperation().matchingLines[0], logId: unchanged.log_id, historyLog: unchanged },
    ] })], nextCursor: null }, isLoading: false, isError: false, refetch: vi.fn() };
    render(<InventoryRecentHistoryPanel item={makeItem()} />);
    expect(screen.getByText("계산 불가")).toBeInTheDocument();
    expect(screen.getByText("변동 없음")).toBeInTheDocument();
  });

  it("알 수 없는 실제 거래 코드는 내부 코드를 노출하지 않고 기타 작업으로 표시한다", () => {
    testState.legacyQueryResult = { data: [makeLog({ operation_id: null, transaction_type: "UNMAPPED" as TransactionLog["transaction_type"] })], isLoading: false, isError: false, refetch: vi.fn() };

    render(<InventoryRecentHistoryPanel item={makeItem()} />);

    expect(screen.getByText("기타 작업")).toBeInTheDocument();
    expect(screen.queryByText("UNMAPPED")).not.toBeInTheDocument();
  });

  it("원장과 연결되지 않은 기존 이력은 중복 없이 구분선 아래에 유지한다", () => {
    testState.queryResult = { data: { items: [makeOperation()], nextCursor: null }, isLoading: false, isError: false, refetch: vi.fn() };
    testState.legacyQueryResult = { data: [makeLog({ log_id: "legacy", operation_id: null, transaction_type: "BACKFLUSH", quantity_change: -60, warehouse_qty_before: 40, warehouse_qty_after: 40, department_qty_before: 60, department_qty_after: 0 })], isLoading: false, isError: false, refetch: vi.fn() };
    const { container } = render(<InventoryRecentHistoryPanel item={makeItem()} />);
    expect(container.querySelector(".inventory-recent-divider")).not.toBeNull();
    expect(screen.getByText("부서 입출고")).toBeInTheDocument();
    expect(screen.getByLabelText("재고 변동: 조립 60 −60→0")).toBeInTheDocument();
    expect(testState.legacyQueryArgs).toEqual([{ itemId: "item-1", unlinkedOnly: true, limit: 5 }]);
  });

  it("작업 그룹은 최신순 5건으로 제한하고 각 그룹의 날짜와 업무 메타를 보존한다", () => {
    testState.queryResult = { data: { items: Array.from({ length: 6 }, (_, index) => makeOperation({ operationId: `operation-${index + 1}`, actorName: `작업자 ${index + 1}` })), nextCursor: null }, isLoading: false, isError: false, refetch: vi.fn() };
    render(<InventoryRecentHistoryPanel item={makeItem()} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("조립 · 작업자 1")).toBeInTheDocument();
    expect(screen.getAllByText("08/14 10:30")).toHaveLength(5);
    expect(screen.queryByText("조립 · 작업자 6")).not.toBeInTheDocument();
  });

  it("조회 실패를 재시도하고 최근 내역이 없으면 국소 빈 상태를 표시한다", () => {
    const refetch = vi.fn();
    const legacyRefetch = vi.fn();
    testState.queryResult = { data: { items: [], nextCursor: null }, isLoading: false, isError: true, refetch };
    render(<InventoryRecentHistoryPanel item={makeItem()} />);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(refetch).toHaveBeenCalledOnce();
    testState.queryResult = { data: { items: [], nextCursor: null }, isLoading: false, isError: false, refetch: vi.fn() };
    testState.legacyQueryResult = { data: [], isLoading: false, isError: false, refetch: legacyRefetch };
    render(<InventoryRecentHistoryPanel item={makeItem()} />);
    expect(screen.getByText("최근 입출고 내역이 없습니다.")).toBeInTheDocument();
  });
});
