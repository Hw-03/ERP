import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { inventoryApi } from "../api/inventory";

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

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

describe("inventoryApi.getInventorySummary", () => {
  it("GET /api/inventory/summary", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ total_items: 0 })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await inventoryApi.getInventorySummary();
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/inventory/summary");
  });
});

describe("inventoryApi.receiveInventory / shipInventory", () => {
  it("receiveInventory POSTs to /api/inventory/receive", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ message: "ok" })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await inventoryApi.receiveInventory({ item_id: "i1", quantity: 5 });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/inventory/receive");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ item_id: "i1", quantity: 5 });
  });

  it("shipInventory POSTs to /api/inventory/ship", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ message: "ok" })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await inventoryApi.shipInventory({ item_id: "i1", quantity: 5 });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/inventory/ship");
  });
});

describe("inventoryApi.transfer*", () => {
  it("transferToProduction with department in body", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ message: "ok" })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await inventoryApi.transferToProduction({
      item_id: "i1",
      quantity: 3,
      department: "조립",
    });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/inventory/transfer-to-production");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.department).toBe("조립");
  });

  it("transferBetweenDepts uses from/to_department", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ message: "ok" })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await inventoryApi.transferBetweenDepts({
      item_id: "i1",
      quantity: 1,
      from_department: "조립",
      to_department: "고압",
    });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.from_department).toBe("조립");
    expect(body.to_department).toBe("고압");
  });
});

describe("inventoryApi.markDefective", () => {
  it("POST with source + target_department", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ message: "ok" })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await inventoryApi.markDefective({
      item_id: "i1",
      quantity: 2,
      source: "warehouse",
      target_department: "AS",
    });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.source).toBe("warehouse");
    expect(body.target_department).toBe("AS");
  });
});

describe("inventoryApi.getItemLocations", () => {
  it("GET /api/inventory/locations/{itemId}", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse([])),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await inventoryApi.getItemLocations("item-1");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/inventory/locations/item-1");
  });
});
