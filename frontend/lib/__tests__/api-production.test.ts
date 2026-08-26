import { describe, it, expect, vi, afterEach } from "vitest";
import { productionApi } from "../api/production";

function makeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "Error",
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function inventoryOperationWire(overrides: Record<string, unknown> = {}) {
  return {
    operation_id: "operation-1",
    kind: "BUSINESS",
    domain: "DEPARTMENT",
    action: "ADJUST",
    display_label: "부서 입출고",
    effective_status: "active",
    actor_employee_id: "employee-1",
    actor_name: "김현우",
    department: "고압",
    reason: null,
    effective_at: "2026-08-25T06:00:00Z",
    reverses_operation_id: null,
    reversal_operation_id: null,
    can_cancel: true,
    cancel_blockers: [],
    lines: [],
    matching_lines: [],
    effects: [],
    ...overrides,
  };
}

describe("productionApi", () => {
  it("productionReceipt POST /api/production/receipt", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await productionApi.productionReceipt({ item_id: "i1", quantity: 5 });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/production/receipt");
  });

  it("checkProduction GET /api/production/bom-check/{id}?quantity=N", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await productionApi.checkProduction("item-1", 10);
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("/api/production/bom-check/item-1");
    expect(url).toContain("quantity=10");
  });

  it("getTransactions builds query string", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await productionApi.getTransactions({ itemId: "I-1", limit: 50 });
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("item_id=I-1");
    expect(url).toContain("limit=50");
  });

  it("getTransactions forwards history operation keys", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await productionApi.getTransactions({ operationKeys: "item_conversion,shipping_prepare" });
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("operation_keys=item_conversion%2Cshipping_prepare");
  });

  it("getTransactions forwards an exact operation batch id", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await productionApi.getTransactions({ operationBatchId: "batch-1" });

    expect(String(fetchSpy.mock.calls[0][0])).toContain("operation_batch_id=batch-1");
  });

  it("getTransactions forwards an exact inventory operation id", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await productionApi.getTransactions({ operationId: "operation-1" });

    expect(String(fetchSpy.mock.calls[0][0])).toContain("operation_id=operation-1");
  });

  it("previews an inventory operation cancellation and maps numeric cells", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({
      operation_id: "operation-1",
      plan_hash: "a".repeat(64),
      can_cancel: true,
      blockers: [],
      cells: [{
        item_id: "item-1",
        scope: "location",
        department: "고압",
        status: "PRODUCTION",
        box_id: null,
        quantity_change: "7",
        current_quantity: "89",
        reserved_quantity: "0",
        quantity_after: "96",
      }],
      defect_records: [],
      effects: [],
    })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const preview = await productionApi.previewInventoryOperationCancellation("operation-1");

    expect(String(fetchSpy.mock.calls[0][0])).toContain(
      "/api/inventory/operations/operation-1/cancel/preview",
    );
    expect(preview).toMatchObject({
      operationId: "operation-1",
      planHash: "a".repeat(64),
      canCancel: true,
      cells: [{ quantityChange: 7, currentQuantity: 89, quantityAfter: 96 }],
    });
  });

  it("cancels an inventory operation with the reviewed plan hash", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(inventoryOperationWire({
      operation_id: "cancellation-1",
      kind: "CANCELLATION",
      effective_status: "cancellation",
      reverses_operation_id: "operation-1",
    }))));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await productionApi.cancelInventoryOperation("operation-1", {
      reason: "작업 전체 취소",
      employee_code: "E06",
      pin: "0305",
      plan_hash: "a".repeat(64),
    });

    expect(result).toMatchObject({
      operationId: "cancellation-1",
      kind: "CANCELLATION",
      reversesOperationId: "operation-1",
    });
    expect(JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body))).toMatchObject({
      reason: "작업 전체 취소",
      employee_code: "E06",
      pin: "0305",
      plan_hash: "a".repeat(64),
    });
  });

  it("getTransactionsSummary forwards history operation keys", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({
        total: 0,
        warehouse_count: 0,
        dept_count: 0,
        adjust_count: 0,
        department_counts: {},
      })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await productionApi.getTransactionsSummary({ operationKeys: "shipping" });
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("operation_keys=shipping");
  });

  it("metaEditTransaction POST /transactions/{id}/meta-edit", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await productionApi.metaEditTransaction("log-1", {
      reason: "fix",
      edited_by_employee_id: "e1",
      edited_by_pin: "0000",
    });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/inventory/transactions/log-1/meta-edit");
  });

  it("getItemsExportUrl returns url with optional category", () => {
    expect(productionApi.getItemsExportUrl()).toContain("/api/items/export.xlsx");
    expect(productionApi.getItemsExportUrl({ category: "raw" })).toContain("category=raw");
  });

  it("getMonthlyCounts GET /transactions/monthly-counts?year=2026", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({ "2026-01": 0, "2026-05": 10 })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const result = await productionApi.getMonthlyCounts(2026);
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("/api/inventory/transactions/monthly-counts");
    expect(url).toContain("year=2026");
    expect(result["2026-05"]).toBe(10);
  });

  it("getTransactionsExportUrl includes start_date / end_date defaults", () => {
    const url = productionApi.getTransactionsExportUrl();
    expect(url).toContain("start_date=");
    expect(url).toContain("end_date=");
  });

  it("getProductionCapacity GET /api/production/capacity", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await productionApi.getProductionCapacity();
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/production/capacity");
  });

  it("getTransactionEdits GET /transactions/{id}/edits", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await productionApi.getTransactionEdits("log-1");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/inventory/transactions/log-1/edits");
  });
  it("getTransactionEdits forwards AbortSignal to fetcher", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const ctrl = new AbortController();

    await productionApi.getTransactionEdits("log-1", { signal: ctrl.signal });

    expect((fetchSpy.mock.calls[0][1] as RequestInit).signal).toBe(ctrl.signal);
  });

  it("quantityCorrectTransaction POST /transactions/{id}/quantity-correction", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ original: {}, correction: {} })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await productionApi.quantityCorrectTransaction("log-1", {
      quantity_change: -1,
      reason: "fix",
      edited_by_employee_id: "e1",
      edited_by_pin: "0000",
    });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/inventory/transactions/log-1/quantity-correction");
  });
});
