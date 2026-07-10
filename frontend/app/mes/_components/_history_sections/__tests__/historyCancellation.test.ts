import { describe, expect, it } from "vitest";
import type { TransactionLog } from "@/lib/api";
import type { IoBatch } from "@/lib/api/types/io";
import type { HistorySelection } from "../historyConstants";
import {
  advanceHistoryLoadReconcileState,
  applyHistoryCancellation,
  reconcileHistorySelection,
  type HistoryLoadReconcileState,
} from "../historyCancellation";

function makeLog(overrides: Partial<TransactionLog> = {}): TransactionLog {
  return {
    log_id: "log-1",
    item_id: "item-1",
    mes_code: "R-001",
    item_name: "부품 A",
    item_process_type_code: "R",
    item_unit: "EA",
    transaction_type: "BACKFLUSH",
    quantity_change: -1,
    quantity_before: 10,
    quantity_after: 9,
    warehouse_qty_before: 0,
    warehouse_qty_after: 0,
    transfer_qty: null,
    reference_no: null,
    produced_by: "요청자 A",
    requester_name: "요청자 A",
    approver_name: null,
    department: "조립",
    notes: null,
    operation_batch_id: "batch-1",
    created_at: "2026-07-10T01:00:00Z",
    cancelled: false,
    cancel_reason: null,
    cancelled_by: null,
    cancelled_at: null,
    inventory_effect: [
      { scope: "location", department: "조립", status: "PRODUCTION", delta: -1 },
    ],
    ...overrides,
  };
}

function makeBatch(overrides: Partial<IoBatch> = {}): IoBatch {
  return {
    batch_id: "batch-1",
    work_type: "process",
    sub_type: "produce",
    status: "completed",
    requester_employee_id: "employee-1",
    requester_name: "요청자 A",
    requester_department: "조립",
    approver_employee_id: null,
    approver_name: null,
    from_department: "조립",
    to_department: "조립",
    requires_approval: false,
    stock_request_id: null,
    reference_no: null,
    notes: null,
    created_at: "2026-07-10T01:00:00Z",
    updated_at: "2026-07-10T01:05:00Z",
    submitted_at: "2026-07-10T01:00:00Z",
    completed_at: "2026-07-10T01:05:00Z",
    bundles: [],
    ...overrides,
  };
}

describe("applyHistoryCancellation", () => {
  it("updates list logs, selection.logs, and batch cache in one patch", () => {
    const first = makeLog();
    const second = makeLog({ log_id: "log-2", item_id: "item-2", item_name: "부품 B" });
    const unrelated = makeLog({ log_id: "other", operation_batch_id: "batch-2" });
    const selection: HistorySelection = {
      kind: "batch",
      batchId: "batch-1",
      logs: [first, second],
    };
    const updated = makeLog({
      cancelled: true,
      cancel_reason: "입력 오류",
      cancelled_by: "employee-1",
      cancelled_at: "2026-07-10T02:00:00Z",
    });
    const batchCache = new Map<string, IoBatch>([
      ["batch-1", makeBatch()],
      ["batch-2", makeBatch({ batch_id: "batch-2" })],
    ]);

    const next = applyHistoryCancellation(
      { logs: [first, second, unrelated], selection, batchCache },
      updated,
      "batch-1",
    );

    expect(next.logs.slice(0, 2).every((log) => log.cancelled)).toBe(true);
    expect(next.logs.slice(0, 2).map((log) => log.cancel_reason)).toEqual([
      "입력 오류",
      "입력 오류",
    ]);
    expect(next.logs[2]).toBe(unrelated);
    expect(next.selection).toMatchObject({
      kind: "batch",
      batchId: "batch-1",
      logs: [
        { log_id: "log-1", cancelled: true, cancel_reason: "입력 오류" },
        { log_id: "log-2", cancelled: true, cancel_reason: "입력 오류" },
      ],
    });
    expect(next.batchCache.get("batch-1")?.status).toBe("cancelled");
    expect(next.batchCache.get("batch-2")?.status).toBe("completed");
  });

  it("patches every same-reference sibling even when shipping phases differ", () => {
    const referenceNo = "defect-disassemble:rework-1";
    const first = makeLog({
      operation_batch_id: null,
      reference_no: referenceNo,
      shipping_phase: "parent",
    });
    const sibling = makeLog({
      log_id: "log-2",
      item_id: "item-2",
      operation_batch_id: null,
      reference_no: referenceNo,
      shipping_phase: "component",
    });
    const unrelated = makeLog({
      log_id: "other",
      operation_batch_id: null,
      reference_no: "defect-disassemble:other",
      shipping_phase: "parent",
    });
    const selection: HistorySelection = {
      kind: "batch",
      batchId: `${referenceNo}::parent`,
      logs: [first],
    };
    const updated = makeLog({
      operation_batch_id: null,
      reference_no: referenceNo,
      shipping_phase: "parent",
      cancelled: true,
      cancel_reason: "재작업 취소",
      cancelled_by: "employee-1",
      cancelled_at: "2026-07-10T02:00:00Z",
    });

    const next = applyHistoryCancellation(
      { logs: [first, sibling, unrelated], selection, batchCache: new Map() },
      updated,
      `${referenceNo}::parent`,
    );

    expect(next.logs.map((log) => log.cancelled)).toEqual([true, true, false]);
    expect(next.selection).toMatchObject({
      kind: "batch",
      logs: [{ log_id: "log-1", cancelled: true }],
    });
  });
});

describe("reconcileHistorySelection", () => {
  it("replaces a surviving selection with the fresh query object", () => {
    const oldLog = makeLog({ item_name: "이전 이름" });
    const freshLog = makeLog({ item_name: "최신 이름" });

    const next = reconcileHistorySelection({ kind: "log", log: oldLog }, [freshLog]);

    expect(next).toEqual({ kind: "log", log: freshLog });
    expect(next && next.kind === "log" ? next.log : null).toBe(freshLog);
  });

  it("refreshes batch logs or closes a selection that left the result", () => {
    const selected: HistorySelection = {
      kind: "batch",
      batchId: "batch-1",
      logs: [makeLog()],
    };
    const fresh = makeLog({ log_id: "fresh" });
    const secondFresh = makeLog({ log_id: "fresh-2", item_id: "item-2" });

    expect(reconcileHistorySelection(selected, [fresh, secondFresh])).toEqual({
      kind: "batch",
      batchId: "batch-1",
      logs: [fresh, secondFresh],
    });
    expect(reconcileHistorySelection(selected, [makeLog({ operation_batch_id: "batch-2" })])).toBeNull();
  });

  it("converts a batch selection to the surviving solo log", () => {
    const selected: HistorySelection = {
      kind: "batch",
      batchId: "batch-1",
      logs: [makeLog(), makeLog({ log_id: "old-2", item_id: "item-2" })],
    };
    const fresh = makeLog({ log_id: "fresh" });

    expect(reconcileHistorySelection(selected, [fresh])).toEqual({
      kind: "log",
      log: fresh,
    });
  });

  it("converts a surviving one-row reference batch to its fresh solo log", () => {
    const referenceNo = "defect-disassemble:rework-1";
    const selected: HistorySelection = {
      kind: "batch",
      batchId: `${referenceNo}::component`,
      logs: [
        makeLog({
          operation_batch_id: null,
          reference_no: referenceNo,
          shipping_phase: "component",
          item_name: "이전 이름",
        }),
      ],
    };
    const fresh = makeLog({
      operation_batch_id: null,
      reference_no: referenceNo,
      shipping_phase: "component",
      item_name: "최신 이름",
    });

    const next = reconcileHistorySelection(selected, [fresh]);

    expect(next).toEqual({ kind: "log", log: fresh });
  });
});

describe("advanceHistoryLoadReconcileState", () => {
  const initial: HistoryLoadReconcileState = { wasLoading: false, loadingLogs: null };

  it("requests reconciliation only after a successful result replaces the loading snapshot", () => {
    const loadingLogs: TransactionLog[] = [];
    const pending = advanceHistoryLoadReconcileState(initial, {
      loading: true,
      error: null,
      logs: loadingLogs,
    });
    const completed = advanceHistoryLoadReconcileState(pending.state, {
      loading: false,
      error: null,
      logs: [],
    });

    expect(pending.shouldReconcile).toBe(false);
    expect(completed.shouldReconcile).toBe(true);
  });

  it("keeps selection during loading and error completion", () => {
    const loadingLogs: TransactionLog[] = [];
    const pending = advanceHistoryLoadReconcileState(initial, {
      loading: true,
      error: null,
      logs: loadingLogs,
    });
    const failed = advanceHistoryLoadReconcileState(pending.state, {
      loading: false,
      error: new Error("조회 실패"),
      logs: loadingLogs,
    });

    expect(pending.shouldReconcile).toBe(false);
    expect(failed.shouldReconcile).toBe(false);
  });
});
