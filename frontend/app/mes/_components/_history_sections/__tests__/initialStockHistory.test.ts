import { describe, expect, it } from "vitest";
import type { TransactionLog } from "@/lib/api/types/production";
import { getHistoryDisplayLabel, getHistoryDisplaySubLabel, getHistoryFlowLabel } from "../historyBatchInterpreter";
import { getHistoryListOperationLabel, getHistoryRowPresentation, getReferenceBatchLinePresentation } from "../historyPresentation";
import { buildHistoryDetailSummary } from "../historyDetailSummary";
import { historyUserNotes } from "../historyOperationSource";
import { getHistoryGroupSummary, resolveStockSnapshot } from "../historyTableHelpers";

function initialLog(overrides: Partial<TransactionLog> = {}): TransactionLog {
  return {
    log_id: "initial-vacuum", item_id: "a6gr", item_name: "A6GR (CEI)", mes_code: "6-VF-0012",
    item_process_type_code: "VF", item_unit: "EA", transaction_type: "RECEIVE",
    quantity_change: 2, quantity_before: 5, quantity_after: 7,
    warehouse_qty_before: 5, warehouse_qty_after: 5,
    department_qty_before: 0, department_qty_after: 2,
    transfer_qty: null, reference_no: "initial_stock:a6gr", produced_by: "오세현",
    requester_name: "오세현", approver_name: null, department: "진공",
    notes: "초기 재고 등록", operation_batch_id: null, operation_id: "initial-operation",
    operation_domain: "item", operation_action: "initial_stock", operation_kind: "BUSINESS",
    operation_display_label: "초기 재고 등록", operation_role: "PRIMARY",
    created_at: "2026-10-19T00:30:57Z", cancelled: false,
    cancel_reason: null, cancelled_by: null, cancelled_at: null,
    inventory_effect: [{ scope: "location", department: "진공", status: "PRODUCTION", delta: 2, quantity_before: 0, quantity_after: 2 }],
    ...overrides,
  };
}

describe("초기 재고 등록 표시", () => {
  it.each(["진공", "튜브", "창고"])("%s 초기 등록의 작업명·경로·위치 수량을 함께 표시한다", (department) => {
    const log = initialLog({ department, inventory_effect: [{ scope: department === "창고" ? "warehouse" : "location", department, delta: 2, quantity_before: 0, quantity_after: 2 }] });
    const destination = department === "창고" ? "창고" : `${department} 부서`;
    expect(getHistoryListOperationLabel(log)).toBe("초기 재고 등록");
    expect(getHistoryDisplayLabel(log)).toBe("초기 재고 등록");
    expect(getHistoryFlowLabel(log)).toBe(`초기 등록 → ${destination}`);
    expect(getHistoryDisplaySubLabel(log)).toBe(`초기 등록 → ${destination}`);
    expect(getHistoryRowPresentation(log).stock).toMatchObject({ scopeLabel: department, before: 0, after: 2 });
    expect(getHistoryGroupSummary({ type: "operation", operationId: "initial-operation", logs: [log] }).label).toBe("초기 재고 등록");
  });

  it("부서 누적 수량 대신 각 위치의 스냅샷을 사용한다", () => {
    const log = initialLog({ quantity_before: 9, quantity_after: 11, department_qty_before: 4, department_qty_after: 6 });
    expect(getHistoryRowPresentation(log).stock).toMatchObject({ scopeLabel: "진공", before: 0, after: 2 });
    expect(resolveStockSnapshot(log)).toMatchObject({ departmentBefore: 0, departmentAfter: 2 });
  });

  it("부서 표기보다 실제 재고 효과의 목적지를 우선한다", () => {
    const log = initialLog({ department: "조립" });
    expect(getHistoryFlowLabel(log)).toBe("초기 등록 → 진공 부서");
  });

  it("여러 위치에 배분한 상세는 모든 목적지를 포함한다", () => {
    const warehouse = initialLog({ log_id: "warehouse", department: "창고", quantity_change: 5, inventory_effect: [{ scope: "warehouse", delta: 5, quantity_before: 0, quantity_after: 5 }] });
    const summary = buildHistoryDetailSummary([warehouse, initialLog()], null);
    expect(summary.operationLabel).toBe("초기 재고 등록");
    expect(summary.flow?.label).toBe("초기 등록 → 창고 · 진공 부서");
  });

  it("초기 등록 묶음의 하위 위치를 구성품으로 표시하지 않는다", () => {
    expect(getReferenceBatchLinePresentation(initialLog(), "batch")).toEqual({ label: "초기 재고 등록", tone: "success" });
  });

  it("취소도 원래 위치의 초기 등록 취소로 표시한다", () => {
    const log = initialLog({ operation_kind: "CANCELLATION", quantity_change: -2, inventory_effect: [{ scope: "location", department: "진공", delta: -2, quantity_before: 2, quantity_after: 0 }] });
    expect(getHistoryListOperationLabel(log)).toBe("초기 재고 등록 취소");
    expect(getHistoryDisplayLabel(log)).toBe("초기 재고 등록 취소");
    expect(getHistoryFlowLabel(log)).toBe("진공 부서 초기 등록 취소");
    expect(getHistoryRowPresentation(log).stock).toMatchObject({ before: 2, after: 0 });
  });

  it("자동 문구는 메모 배지에서 제외하고 직접 입력한 문구는 보존한다", () => {
    const log = initialLog();
    expect(historyUserNotes(log)).toBeNull();
    expect(getHistoryRowPresentation(log).statusChips.some((chip) => chip.label === "메모")).toBe(false);
    expect(historyUserNotes({ ...log, notes: "현장 수량 확인" })).toBe("현장 수량 확인");
    expect(getHistoryRowPresentation({ ...log, notes: "현장 수량 확인" }).statusChips).toContainEqual({ label: "메모", tone: "primary", title: "현장 수량 확인" });
  });

  it("메모만 같은 원자재 입고를 초기 등록으로 분류하지 않는다", () => {
    const log = initialLog({ operation_domain: null, operation_action: null });
    expect(getHistoryListOperationLabel(log)).toBe("원자재 입고");
    expect(getHistoryFlowLabel(log)).toBe("공급사 → 창고");
    expect(historyUserNotes(log)).toBe("초기 재고 등록");
  });
});
