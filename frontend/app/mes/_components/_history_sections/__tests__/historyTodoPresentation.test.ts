import { describe, expect, it } from "vitest";
import type { TransactionLog } from "@/lib/api/types/production";
import { getHistoryRowPresentation, getReferenceBatchPresentation } from "../historyPresentation";
import { buildGroups, getHistorySeparationHint } from "../historyTableHelpers";

function log(overrides: Partial<TransactionLog> = {}): TransactionLog {
  return {
    log_id: "log-1",
    item_id: "item-1",
    mes_code: "3-AA-0001",
    item_name: "\uAE30\uC874\uD488",
    item_process_type_code: "AA",
    item_unit: "EA",
    transaction_type: "BACKFLUSH",
    quantity_change: -1,
    quantity_before: 400,
    quantity_after: 399,
    warehouse_qty_before: null,
    warehouse_qty_after: null,
    transfer_qty: 1,
    reference_no: "ITEM-CONV-1",
    produced_by: "\uAE40\uC694\uCCAD",
    requester_name: "\uAE40\uC694\uCCAD",
    approver_name: null,
    department: "\uC870\uB9BD",
    notes: null,
    reason_category: null,
    reason_memo: null,
    operation_batch_id: null,
    shipping_phase: "COMPONENT_CHANGE",
    created_at: "2026-07-10T08:00:00Z",
    edit_count: 0,
    cancelled: false,
    cancel_reason: null,
    cancelled_by: null,
    cancelled_at: null,
    inventory_effect: null,
    ...overrides,
  };
}

describe("history follow-up presentation contracts", () => {
  it("exposes both source and target for an item conversion", () => {
    const presentation = getReferenceBatchPresentation([
      log({ notes: "\uD488\uBAA9 \uC804\uD658 \uC18C\uC2A4 \uC0AC\uC6A9" }),
      log({
        log_id: "target",
        item_id: "item-2",
        mes_code: "3-AA-0002",
        item_name: "\uBCC0\uACBD\uD488",
        transaction_type: "PRODUCE",
        quantity_change: 1,
        quantity_after: 1,
        notes: "\uD488\uBAA9 \uC804\uD658 \uB300\uC0C1 \uC785\uACE0",
      }),
    ]);

    expect(presentation.sourceTarget).toEqual({
      sourceTitle: "\uAE30\uC874\uD488",
      sourceCode: "3-AA-0001",
      targetTitle: "\uBCC0\uACBD\uD488",
      targetCode: "3-AA-0002",
    });
    expect(presentation.flowLabel).toBe("\uC644\uC81C\uD488 \uC785\uACE0 \u00B7 \uBD80\uD488 \uCC28\uAC10");
  });

  it("uses the actual backflush department as the stock scope", () => {
    expect(getHistoryRowPresentation(log()).stock?.label).toBe("\uC870\uB9BD \uC7AC\uACE0 399 EA");
  });

  it("does not use a multiple-location label for a mixed shipment preparation", () => {
    const presentation = getReferenceBatchPresentation([
      log({
        log_id: "left",
        reference_no: "SHIP-1",
        shipping_phase: "PREPARE",
        transaction_type: "BACKFLUSH",
        department: "\uC870\uB9BD",
      }),
      log({
        log_id: "right",
        reference_no: "SHIP-1",
        shipping_phase: "PREPARE",
        transaction_type: "PRODUCE",
        department: "\uCD9C\uD558",
      }),
    ]);

    expect(presentation.flowLabel).toBe("\uCD9C\uD558 \uC900\uBE44");
  });

  it("explains why consecutive rows for the same item remain separate", () => {
    const previous = log({ item_id: "same", created_at: "2026-07-10T08:00:00Z" });

    expect(getHistorySeparationHint(previous, log({ item_id: "same", cancelled: true }))).toBe("\uCDE8\uC18C \uC774\uB825");
    expect(getHistorySeparationHint(previous, log({ item_id: "same", requester_name: "\uB2E4\uB978 \uC694\uCCAD\uC790" }))).toBe("\uB2E4\uB978 \uC694\uCCAD");
    expect(getHistorySeparationHint(previous, log({ item_id: "same", created_at: "2026-07-10T08:01:00Z" }))).toBe("\uBCC4\uB3C4 \uC2DC\uAC01");
  });

  it("visually groups only matching defect lifecycle logs within exactly 60 seconds", () => {
    const groups = buildGroups([
      log({
        log_id: "marked",
        reference_no: null,
        shipping_phase: null,
        transaction_type: "MARK_DEFECTIVE",
        quantity_change: -2,
        reason_category: "\uD30C\uC190",
        reason_memo: "\uCC0C\uD798",
      }),
      log({
        log_id: "scrapped",
        reference_no: null,
        shipping_phase: null,
        transaction_type: "DEFECT_SCRAP",
        quantity_change: -2,
        reason_category: "\uD30C\uC190",
        reason_memo: "\uCC0C\uD798",
        created_at: "2026-07-10T08:01:00Z",
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ type: "defect_lifecycle" });
    if (groups[0]?.type === "defect_lifecycle") {
      expect(groups[0].parent.log_id).toBe("marked");
      expect(groups[0].child.log_id).toBe("scrapped");
    }
  });

  it("does not group a matching defect lifecycle after 61 seconds", () => {
    const groups = buildGroups([
      log({ log_id: "marked", reference_no: null, shipping_phase: null, transaction_type: "MARK_DEFECTIVE", reason_category: "\uD30C\uC190" }),
      log({
        log_id: "scrapped",
        reference_no: null,
        shipping_phase: null,
        transaction_type: "DEFECT_SCRAP",
        reason_category: "\uD30C\uC190",
        created_at: "2026-07-10T08:01:01Z",
      }),
    ]);

    expect(groups.map((group) => group.type)).toEqual(["solo", "solo"]);
  });
});
