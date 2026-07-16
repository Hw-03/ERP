import { describe, expect, it } from "vitest";
import type { TransactionLog } from "@/lib/api";
import type { IoBatch } from "@/lib/api/types/io";
import { buildHistoryDetailSummary } from "../historyDetailSummary";

function makeLog(overrides: Partial<TransactionLog> = {}): TransactionLog {
  return {
    log_id: "log-1",
    item_id: "item-finished",
    mes_code: "PF-001",
    item_name: "완제품 A",
    item_process_type_code: "PF",
    item_unit: "EA",
    transaction_type: "PRODUCE",
    quantity_change: 1,
    quantity_before: 309,
    quantity_after: 401,
    warehouse_qty_before: 401,
    warehouse_qty_after: 401,
    transfer_qty: null,
    reference_no: null,
    produced_by: "처리자",
    requester_name: "요청자 A",
    approver_name: null,
    requested_at: "2026-07-10T01:00:00Z",
    approved_at: null,
    department: "조립",
    notes: null,
    operation_batch_id: null,
    created_at: "2026-07-10T01:05:00Z",
    cancelled: false,
    cancel_reason: null,
    cancelled_by: null,
    cancelled_at: null,
    inventory_effect: [
      { scope: "warehouse", delta: 0 },
      { scope: "location", department: "조립", status: "PRODUCTION", delta: 1 },
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

describe("buildHistoryDetailSummary", () => {
  it("uses only canonical non-zero inventory effects for a single log", () => {
    const summary = buildHistoryDetailSummary([makeLog()], null);

    expect(summary.target).toEqual({
      itemId: "item-finished",
      itemName: "완제품 A",
      mesCode: "PF-001",
    });
    expect(summary.operationLabel).toBe("생산");
    expect(summary.status).toEqual({ label: "완료", tone: "success", reason: null });
    expect(summary.requester).toEqual({
      name: "요청자 A",
      at: "2026-07-10T01:00:00Z",
    });
    expect(summary.impactGroups).toHaveLength(1);
    expect(summary.impactGroups[0].effects).toEqual([
      expect.objectContaining({
        itemId: "item-finished",
        unit: "EA",
        label: "조립 재고",
        delta: 1,
      }),
    ]);
    expect(summary).not.toHaveProperty("stock");
    expect(summary).not.toHaveProperty("movement");
    expect(summary.flow).toEqual({
      label: "생산 입고",
      from: null,
      to: null,
    });
  });

  it("hides a matching warehouse box effect when the warehouse total already states the same impact", () => {
    const summary = buildHistoryDetailSummary([
      makeLog({
        inventory_effect: [
          { scope: "warehouse", delta: -1 },
          { scope: "warehouse_box", box_id: "box-1", delta: -1 },
        ],
      }),
    ], null);

    expect(summary.impactGroups[0].effects).toEqual([
      expect.objectContaining({ label: "창고 재고", delta: -1 }),
    ]);
  });

  it("keeps a box effect when there is no matching warehouse total or its quantity differs", () => {
    const summary = buildHistoryDetailSummary([
      makeLog({
        inventory_effect: [
          { scope: "warehouse", delta: -2 },
          { scope: "warehouse_box", box_id: "box-1", delta: -1 },
        ],
      }),
    ], null);

    expect(summary.impactGroups).toEqual([
      expect.objectContaining({
        label: "창고 재고",
        effects: [expect.objectContaining({ label: "창고 재고", delta: -2 })],
      }),
      expect.objectContaining({
        label: "박스 재고",
        effects: [expect.objectContaining({ label: "박스 재고", delta: -1 })],
      }),
    ]);
  });

  it("keeps different component items separate even at the same location", () => {
    const logs = [
      makeLog({
        log_id: "output",
        operation_batch_id: "batch-1",
        quantity_change: 2,
        inventory_effect: [
          { scope: "location", department: "조립", status: "PRODUCTION", delta: 2 },
        ],
      }),
      makeLog({
        log_id: "component-a",
        item_id: "item-a",
        item_name: "부품 A",
        mes_code: "R-001",
        transaction_type: "BACKFLUSH",
        quantity_change: -2,
        operation_batch_id: "batch-1",
        inventory_effect: [
          { scope: "location", department: "조립", status: "PRODUCTION", delta: -2 },
        ],
      }),
      makeLog({
        log_id: "component-b",
        item_id: "item-b",
        item_name: "부품 B",
        mes_code: "R-002",
        transaction_type: "BACKFLUSH",
        quantity_change: -3,
        operation_batch_id: "batch-1",
        inventory_effect: [
          { scope: "location", department: "조립", status: "PRODUCTION", delta: -3 },
        ],
      }),
    ];

    const summary = buildHistoryDetailSummary(logs, makeBatch());

    expect(summary.target.itemId).toBe("item-finished");
    expect(summary.impactGroups.map((group) => group.label)).toEqual(["조립 재고"]);
    expect(summary.impactGroups[0].effects.map((effect) => [effect.itemId, effect.delta])).toEqual([
      ["item-finished", 2],
      ["item-a", -2],
      ["item-b", -3],
    ]);
  });

  it("combines repeated effects only when every identity field matches", () => {
    const logs = [
      makeLog({
        log_id: "component-a-1",
        item_id: "item-a",
        item_name: "부품 A",
        mes_code: "R-001",
        transaction_type: "BACKFLUSH",
        operation_batch_id: "batch-1",
        inventory_effect: [
          { scope: "warehouse_box", box_id: "box-1", delta: -1 },
        ],
      }),
      makeLog({
        log_id: "component-a-2",
        item_id: "item-a",
        item_name: "부품 A",
        mes_code: "R-001",
        transaction_type: "BACKFLUSH",
        operation_batch_id: "batch-1",
        inventory_effect: [
          { scope: "warehouse_box", box_id: "box-1", delta: -2 },
          { scope: "warehouse_box", box_id: "box-2", delta: -4 },
        ],
      }),
    ];

    const summary = buildHistoryDetailSummary(logs, makeBatch());
    const effects = summary.impactGroups.flatMap((group) => group.effects);

    expect(effects.map((effect) => [effect.boxId, effect.delta])).toEqual([
      ["box-1", -3],
      ["box-2", -4],
    ]);
  });

  it("uses the first bundle source item as the primary target for multiple outputs", () => {
    const secondaryOutput = makeLog({
      log_id: "secondary-output",
      item_id: "item-secondary",
      item_name: "Secondary output",
      mes_code: "PF-002",
      operation_batch_id: "batch-1",
      inventory_effect: [
        { scope: "location", department: "assembly", status: "PRODUCTION", delta: 2 },
      ],
    });
    const primaryOutput = makeLog({
      log_id: "primary-output",
      item_id: "item-primary",
      item_name: "Primary output",
      mes_code: "PF-001",
      operation_batch_id: "batch-1",
      inventory_effect: [
        { scope: "location", department: "assembly", status: "PRODUCTION", delta: 1 },
      ],
    });
    const batch = makeBatch({
      bundles: [
        {
          bundle_id: "primary-bundle",
          source_kind: "bom_parent",
          title: "Primary output",
          source_item_id: "item-primary",
          source_mes_code: "PF-001",
          quantity: 1,
          expanded_level: 1,
          lines: [],
        },
      ],
    });

    const summary = buildHistoryDetailSummary([secondaryOutput, primaryOutput], batch);
    const primaryEffect = summary.impactGroups
      .flatMap((group) => group.effects)
      .find((effect) => effect.itemId === summary.target.itemId);

    expect(summary.target).toEqual({
      itemId: "item-primary",
      itemName: "Primary output",
      mesCode: "PF-001",
    });
    expect(primaryEffect?.itemName).toBe(summary.target.itemName);
  });

  it("exposes both ends of an item conversion in the detail summary", () => {
    const source = makeLog({
      log_id: "conversion-source",
      item_id: "item-source",
      item_name: "기존품",
      mes_code: "SRC-001",
      transaction_type: "BACKFLUSH",
      quantity_change: -1,
      shipping_phase: "COMPONENT_CHANGE",
      notes: "품목 전환 소스",
      inventory_effect: [
        { scope: "location", department: "조립", status: "PRODUCTION", delta: -1 },
      ],
    });
    const target = makeLog({
      log_id: "conversion-target",
      item_id: "item-target",
      item_name: "변경품",
      mes_code: "TGT-001",
      transaction_type: "RECEIVE",
      quantity_change: 1,
      shipping_phase: "COMPONENT_CHANGE",
      notes: "품목 전환 대상",
      inventory_effect: [
        { scope: "location", department: "조립", status: "PRODUCTION", delta: 1 },
      ],
    });

    const summary = buildHistoryDetailSummary([source, target], null);

    expect(summary.conversion).toEqual({
      source: { itemId: "item-source", itemName: "기존품", mesCode: "SRC-001" },
      target: { itemId: "item-target", itemName: "변경품", mesCode: "TGT-001" },
    });
  });

  it("combines production actual effects with BOM metadata in one impact list", () => {
    const output = makeLog({
      log_id: "output",
      item_id: "item-finished",
      item_name: "완제품 A",
      mes_code: "PF-001",
      operation_batch_id: "batch-1",
      quantity_change: 2,
      inventory_effect: [
        { scope: "location", department: "조립", status: "PRODUCTION", delta: 2 },
      ],
    });
    const component = makeLog({
      log_id: "component",
      item_id: "component-a",
      item_name: "이전 부품명",
      mes_code: null,
      transaction_type: "BACKFLUSH",
      operation_batch_id: "batch-1",
      quantity_change: -3,
      inventory_effect: [
        { scope: "location", department: "조립", status: "PRODUCTION", delta: -3 },
      ],
    });
    const batch = makeBatch({
      bundles: [{
        bundle_id: "bundle-1",
        source_kind: "bom_parent",
        title: "완제품 A",
        source_item_id: "item-finished",
        source_mes_code: "PF-001",
        quantity: 2,
        expanded_level: 1,
        lines: [
          {
            line_id: "finished",
            item_id: "item-finished",
            item_name: "완제품 A",
            mes_code: "PF-001",
            unit: "EA",
            direction: "in",
            from_bucket: "none",
            from_department: "조립",
            to_bucket: "production",
            to_department: "조립",
            quantity: 2,
            bom_expected: null,
            included: true,
            origin: "direct",
            edited: false,
            has_children: true,
            shortage: 0,
            exclusion_note: null,
          },
          {
            line_id: "component",
            item_id: "component-a",
            item_name: "BOM 부품 A",
            mes_code: "R-001",
            unit: "EA",
            direction: "out",
            from_bucket: "production",
            from_department: "조립",
            to_bucket: "none",
            to_department: "조립",
            quantity: 3,
            bom_expected: 3,
            included: true,
            origin: "bom_auto",
            edited: false,
            has_children: false,
            shortage: 0,
            exclusion_note: null,
          },
        ],
      }],
    });

    const summary = buildHistoryDetailSummary([output, component], batch);

    expect(summary.impactGroups).toHaveLength(1);
    expect(summary.impactGroups[0].effects).toEqual([
      expect.objectContaining({
        itemId: "item-finished",
        itemName: "완제품 A",
        mesCode: "PF-001",
        role: "완제품",
        delta: 2,
        mismatchLabel: null,
      }),
      expect.objectContaining({
        itemId: "component-a",
        itemName: "BOM 부품 A",
        mesCode: "R-001",
        role: "부품",
        delta: -3,
        mismatchLabel: null,
      }),
    ]);
  });

  it("marks a BOM quantity only when it differs from the actual effect", () => {
    const component = makeLog({
      item_id: "component-a",
      item_name: "부품 A",
      transaction_type: "BACKFLUSH",
      operation_batch_id: "batch-1",
      quantity_change: -2,
      inventory_effect: [
        { scope: "location", department: "조립", status: "PRODUCTION", delta: -2 },
      ],
    });
    const batch = makeBatch({
      bundles: [{
        bundle_id: "bundle-1",
        source_kind: "bom_parent",
        title: "완제품 A",
        source_item_id: "item-finished",
        source_mes_code: "PF-001",
        quantity: 1,
        expanded_level: 1,
        lines: [{
          line_id: "component",
          item_id: "component-a",
          item_name: "부품 A",
          mes_code: "R-001",
          unit: "EA",
          direction: "out",
          from_bucket: "production",
          from_department: "조립",
          to_bucket: "none",
          to_department: "조립",
          quantity: 3,
          bom_expected: 3,
          included: true,
          origin: "bom_auto",
          edited: false,
          has_children: false,
          shortage: 0,
          exclusion_note: null,
        }],
      }],
    });

    const effect = buildHistoryDetailSummary([component], batch).impactGroups[0].effects[0];

    expect(effect.mismatchLabel).toBe("BOM 3 EA");
  });
});
