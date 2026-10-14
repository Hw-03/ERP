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
  it("forwards requester identity with existing history filters to all four projections", async () => {
    const fetchSpy = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("display-groups")) return makeResponse({ groups: [], next_cursor: null, has_more: false });
      if (url.includes("display-calendar")) return makeResponse({ days: {}, months: {} });
      if (url.includes("reference-summaries")) return makeResponse([]);
      return makeResponse({ total: 0, warehouse_count: 0, dept_count: 0, adjust_count: 0, department_counts: {} });
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const params = { requesterEmployeeId: "employee-a", department: "조립", model: "DIO", search: "김", operationKeys: "item_conversion" };
    await productionApi.getTransactionDisplayGroups({ ...params, dateFrom: "2026-10-01", cursor: "next-page" });
    await productionApi.getTransactionDisplayCalendar({ ...params, year: 2026, month: 10 });
    await productionApi.getTransactionsSummary({ ...params, dateFrom: "2026-10-01" });
    await productionApi.getTransactionReferenceSummaries({ ...params, dateFrom: "2026-10-01" });
    for (const [url] of fetchSpy.mock.calls) {
      const query = new URL(String(url), "http://localhost").searchParams;
      expect(query.get("requester_employee_id")).toBe("employee-a");
      expect(query.get("department")).toBe("조립");
      expect(query.get("model")).toBe("DIO");
      expect(query.get("search")).toBe("김");
      expect(query.get("operation_keys")).toBe("item_conversion");
    }
    expect(String(fetchSpy.mock.calls[0][0])).toContain("cursor=next-page");
    fetchSpy.mockClear();
    await productionApi.getTransactionsSummary({ dateFrom: "2026-10-01" });
    expect(String(fetchSpy.mock.calls[0][0])).not.toContain("requester_employee_id");
  });

  it("품목 작업 전용 응답을 기존 작업 상세와 동일하게 매핑한다", async () => {
    globalThis.fetch = vi.fn(async () => makeResponse({ groups: [{ type: "operation", key: "operation-1", logs: [], operation: inventoryOperationWire({ business_correction: { correction_id: "c", source_type: "InventoryOperation", source_id: "o", source_operation_id: "o", source_operation_ids: ["o"] } }) }], next_cursor: null, has_more: false })) as typeof fetch;
    const page = await productionApi.getTransactionDisplayGroups({ itemId: "item-1", includeOperationOnly: true });
    expect(page.groups[0].operation).toMatchObject({ operationId: "operation-1", actorName: "김현우", businessCorrection: { sourceOperationIds: ["o"] } });
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining("include_operation_only=true"), expect.anything());
  });
  it("maps calendar category counts while preserving day and month keys", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({
      days: { "2026-10-12": { total: 91, warehouse_count: 0, dept_count: 0, adjust_count: 91, other_count: 0 } },
      months: { "2026-10": 342 },
    })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const result = await productionApi.getTransactionDisplayCalendar({ year: 2026, month: 10, search: "애노드", department: "튜브" });
    expect(result.days["2026-10-12"]).toMatchObject({ total: 91, adjustCount: 91, otherCount: 0 });
    expect(result.months["2026-10"]).toBe(342);
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("display-calendar?"), expect.any(Object));
  });
  it("maps zero-difference observations and every correction source without quantity logs", async () => {
    globalThis.fetch = vi.fn(async () => makeResponse(inventoryOperationWire({
      observation_lines: [{ row_type: "STOCKTAKE_OBSERVATION", application_id: "a1", count_id: "c1", confirmation_revision_id: "r1", item_id: "i1", item_name: "품목", mes_code: "M1", scope_key: "warehouse", before_quantities: { normal: 7, defect: 0, b_grade: 0, obsolete: 0 }, after_quantities: { normal: 7, defect: 0, b_grade: 0, obsolete: 0 }, reservations: { normal: 2, defect: 0, b_grade: 0, obsolete: 0 }, observation_epoch_before: 2, observation_epoch_after: 3 }],
      matching_observation_lines: [],
      business_correction: { correction_id: "bc1", source_type: "ShippingRequest", source_id: "s1", source_operation_id: null, source_operation_ids: ["prepare", "pickup"] },
    }))) as typeof fetch;
    const result = await productionApi.getInventoryOperation("work/1");
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("/operations/work%2F1");
    expect(result.lines).toEqual([]);
    expect(result.observationLines?.[0]).toMatchObject({ countId: "c1", beforeQuantities: { normal: 7 }, afterQuantities: { normal: 7 }, observationEpochAfter: 3 });
    expect(result.businessCorrection?.sourceOperationIds).toEqual(["prepare", "pickup"]);
  });

  it("exports integrated work separately with the exact selected dates", () => {
    expect(productionApi.getInventoryOperationsExportUrl("csv", { start_date: "2026-10-01", end_date: "2026-10-06" })).toContain("/operations/export.csv?start_date=2026-10-01&end_date=2026-10-06");
    expect(productionApi.getInventoryOperationsExportUrl("xlsx", { start_date: "2026-10-01", end_date: "2026-10-06" })).toContain("/operations/export.xlsx?");
  });

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

  it("getTransactions forwards the legacy-only filter", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await productionApi.getTransactions({ itemId: "I-1", unlinkedOnly: true, limit: 5 });

    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("unlinked_only=true");
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

  it("inventory operation lines map the nested history log for history presentation", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({
      items: [inventoryOperationWire({
        matching_lines: [{
          log_id: "log-1",
          item_id: "item-1",
          item_name: "저항",
          mes_code: "46-AA-0080",
          transaction_type: "TRANSFER_TO_PROD",
          quantity_change: "12",
          quantity_before: "15",
          quantity_after: "27",
          transfer_qty: null,
          department: "조립",
          operation_role: "PRIMARY",
          reverses_log_id: null,
          reference_no: null,
          notes: null,
          created_at: "2026-08-25T06:00:00Z",
          history_log: { log_id: "log-1", transaction_type: "TRANSFER_TO_PROD", quantity_change: 12 },
        }],
      })],
      next_cursor: null,
    })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const page = await productionApi.getInventoryOperations({ itemId: "item-1" });

    expect(page.items[0].matchingLines[0]).toMatchObject({
      quantityChange: 12,
      historyLog: { log_id: "log-1", transaction_type: "TRANSFER_TO_PROD" },
    });
  });

  it("maps display-group matched log ids from the wire response", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({
      groups: [{
        type: "operation",
        key: "operation-1",
        logs: [],
        matched_log_ids: ["child-1", "child-2"],
      }],
      next_cursor: null,
      has_more: false,
    })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const page = await productionApi.getTransactionDisplayGroups({ search: "connector" });

    expect(page.groups[0]).toMatchObject({
      key: "operation-1",
      matchedLogIds: ["child-1", "child-2"],
    });
  });

  it("품목별 내역은 기간 제한 없이 품목 ID와 커서를 전달한다", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({ groups: [], next_cursor: null, has_more: false })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await productionApi.getTransactionDisplayGroups({ itemId: "item-1", limit: 10, cursor: "next-page" });
    const params = new URL(String(fetchSpy.mock.calls[0][0]), "http://localhost").searchParams;
    expect(params.get("item_id")).toBe("item-1");
    expect(params.get("cursor")).toBe("next-page");
    expect(params.get("limit")).toBe("10");
    expect(params.has("date_from")).toBe(false);
    expect(params.has("include_archived")).toBe(false);
  });

  it("maps submission work groups without changing raw transaction fields", async () => {
    const log = { log_id: "original", submission_id: "submit-1", reason_category_id: "category-1" };
    globalThis.fetch = vi.fn(() => Promise.resolve(makeResponse({ groups: [{
      type: "submission", key: "submission:submit-1", logs: [log], matched_log_ids: ["original"],
      work_groups: [{ type: "operation", key: "work-1", logs: [log], matched_log_ids: ["original"] }],
    }], next_cursor: null, has_more: false }))) as unknown as typeof fetch;
    const page = await productionApi.getTransactionDisplayGroups();
    expect(page.groups[0].workGroups?.[0]).toMatchObject({ type: "operation", key: "work-1", matchedLogIds: ["original"], logs: [log] });
    expect(page.groups[0].workGroups?.[0].workGroups).toEqual([]);
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
