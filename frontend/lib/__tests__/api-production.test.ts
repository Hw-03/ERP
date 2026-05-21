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
