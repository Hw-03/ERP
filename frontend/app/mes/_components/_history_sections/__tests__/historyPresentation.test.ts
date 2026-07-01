import { describe, expect, it } from "vitest";
import type { TransactionLog } from "@/lib/api/types/production";
import type { IoBatch, IoBundle, IoLine } from "@/lib/api/types/io";
import {
  getBatchLineStats,
  getHistoryRowPresentation,
  getReferenceBatchPresentation,
} from "../historyPresentation";

function makeLog(overrides: Partial<TransactionLog> = {}): TransactionLog {
  return {
    log_id: "log-1",
    item_id: "ITEM-1",
    mes_code: "AX-001",
    item_name: "AX-100",
    item_process_type_code: "AF",
    item_unit: "EA",
    transaction_type: "RECEIVE",
    quantity_change: 10,
    quantity_before: 2,
    quantity_after: 12,
    warehouse_qty_before: null,
    warehouse_qty_after: null,
    transfer_qty: 10,
    reference_no: "REF-1",
    produced_by: "김민재(창고)",
    requester_name: "김민재",
    approver_name: "박승인",
    requested_at: "2026-06-30T01:00:00Z",
    approved_at: "2026-06-30T01:05:00Z",
    department: "조립",
    notes: "현장 확인 메모",
    operation_batch_id: null,
    created_at: "2026-06-30T01:05:00Z",
    edit_count: 0,
    cancelled: false,
    cancel_reason: null,
    cancelled_by: null,
    cancelled_at: null,
    inventory_effect: null,
    ...overrides,
  };
}

function makeLine(overrides: Partial<IoLine> = {}): IoLine {
  return {
    line_id: "line-1",
    item_id: "ITEM-1",
    item_name: "AX-100",
    mes_code: "AX-001",
    unit: "EA",
    direction: "in",
    from_bucket: "none",
    from_department: null,
    to_bucket: "production",
    to_department: "조립",
    quantity: 2,
    bom_expected: null,
    included: true,
    origin: "direct",
    edited: false,
    has_children: false,
    shortage: 0,
    exclusion_note: null,
    ...overrides,
  };
}

function makeBundle(overrides: Partial<IoBundle> & { lines?: IoLine[] } = {}): IoBundle {
  return {
    bundle_id: "bundle-1",
    source_kind: "bom_parent",
    title: "AX-100",
    source_item_id: "ITEM-1",
    source_mes_code: "AX-001",
    quantity: 2,
    expanded_level: 1,
    lines: [],
    ...overrides,
  };
}

function makeBatch(overrides: Partial<IoBatch> & { bundles?: IoBundle[] } = {}): IoBatch {
  return {
    batch_id: "batch-1",
    work_type: "process",
    sub_type: "produce",
    status: "completed",
    requester_employee_id: "emp-1",
    requester_name: "김민재",
    requester_department: "조립",
    approver_employee_id: "emp-2",
    approver_name: "박승인",
    from_department: "조립",
    to_department: "조립",
    requires_approval: true,
    stock_request_id: "req-1",
    reference_no: "BATCH-1",
    notes: "생산 메모",
    created_at: "2026-06-30T01:00:00Z",
    updated_at: "2026-06-30T01:05:00Z",
    submitted_at: "2026-06-30T01:00:00Z",
    completed_at: "2026-06-30T01:05:00Z",
    bundles: [],
    ...overrides,
  };
}

describe("historyPresentation", () => {
  it("summarizes a production BOM batch as one field operation", () => {
    const parent = makeLine({ line_id: "parent", origin: "direct", quantity: 2 });
    const child = makeLine({
      line_id: "child",
      item_id: "ITEM-2",
      item_name: "부품 A",
      mes_code: "RA-001",
      origin: "bom_auto",
      direction: "out",
      from_bucket: "production",
      from_department: "조립",
      to_bucket: "none",
      quantity: 6,
      shortage: 3,
    });
    const excluded = makeLine({
      line_id: "excluded",
      item_id: "ITEM-3",
      item_name: "부품 B",
      origin: "bom_auto",
      included: false,
      quantity: 1,
    });
    const batch = makeBatch({ bundles: [makeBundle({ lines: [parent, child, excluded] })] });
    const row = getHistoryRowPresentation(
      makeLog({
        transaction_type: "PRODUCE",
        operation_batch_id: "batch-1",
        edit_count: 2,
      }),
      batch,
    );

    expect(getBatchLineStats(batch)).toEqual({
      bundleCount: 1,
      bomBundleCount: 1,
      directBundleCount: 0,
      lineCount: 2,
      includedCount: 1,
      excludedCount: 1,
      shortageCount: 1,
    });
    expect(row.operation.label).toBe("생산");
    expect(row.target.title).toBe("AX-100");
    expect(row.target.meta).toEqual(["BOM 1묶음", "2라인"]);
    expect(row.flow.label).toBe("조립");
    expect(row.people).toEqual({ requester: "김민재", approver: "박승인" });
    expect(row.statusChips.map((chip) => chip.label)).toEqual([
      "수정 2",
      "메모",
      "부족 1",
      "제외 1",
    ]);
  });

  it("keeps single-log stock, actor, and cancel signals visible without reference chips", () => {
    const row = getHistoryRowPresentation(
      makeLog({
        transaction_type: "SHIP",
        quantity_change: -5,
        quantity_before: 12,
        quantity_after: 7,
        cancelled: true,
        notes: null,
      }),
    );

    expect(row.operation.label).toBe("출고");
    expect(row.target.title).toBe("AX-100");
    expect(row.target.meta).toEqual([]);
    expect(row.flow.label).toBe("창고 → 외부");
    expect(row.stock?.label).toBe("처리 후 7 EA");
    expect(row.people).toEqual({ requester: "김민재", approver: "박승인" });
    expect(row.statusChips.map((chip) => chip.label)).toEqual(["취소"]);
  });
  it("labels shipping-reference SHIP logs as shipment without exposing process meta", () => {
    const row = getHistoryRowPresentation(
      makeLog({
        transaction_type: "SHIP",
        quantity_change: -1,
        transfer_qty: 1,
        reference_no: "SHIP-abc123",
        notes: "출하 픽업 완료: AX-100",
      }),
    );

    expect(row.operation.label).toBe("출하");
    expect(row.target.meta).toEqual([]);
  });

  it("classifies reference batches as shipment or outbound composition", () => {
    const shipment = getReferenceBatchPresentation([
      makeLog({ log_id: "ship-1", transaction_type: "SHIP", reference_no: "SHIP-abc123" }),
      makeLog({ log_id: "ship-2", transaction_type: "SHIP", reference_no: "SHIP-abc123", item_id: "ITEM-2" }),
    ]);
    const outbound = getReferenceBatchPresentation([
      makeLog({ log_id: "out-1", transaction_type: "SHIP", reference_no: "OUT-1" }),
      makeLog({ log_id: "out-2", transaction_type: "SHIP", reference_no: "OUT-1", item_id: "ITEM-2" }),
    ]);

    expect(shipment.operationLabel).toBe("출하");
    expect(shipment.targetTitle).toBe("출하 구성 2건");
    expect(outbound.operationLabel).toBe("출고 구성");
    expect(outbound.targetTitle).toBe("출고 구성 2건");
  });
  it("treats mixed shipping-reference preparation and pickup logs as one shipment batch", () => {
    const shipment = getReferenceBatchPresentation([
      makeLog({ log_id: "prep-1", transaction_type: "BACKFLUSH", reference_no: "SHIP-mixed", item_id: "ITEM-A" }),
      makeLog({ log_id: "prep-2", transaction_type: "PRODUCE", reference_no: "SHIP-mixed", item_id: "ITEM-B" }),
      makeLog({ log_id: "pickup-1", transaction_type: "SHIP", reference_no: "SHIP-mixed", item_id: "ITEM-C" }),
    ]);

    expect(shipment.operationLabel).toBe("출하");
    expect(shipment.targetTitle).toBe("출하 구성 3건");
  });
});
