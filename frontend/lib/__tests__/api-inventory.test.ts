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
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({ total_items: 0 })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await inventoryApi.getInventorySummary();
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/inventory/summary");
  });
});

describe("inventoryApi.getItemLocations", () => {
  it("GET /api/inventory/locations/{itemId}", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await inventoryApi.getItemLocations("item-1");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/inventory/locations/item-1");
  });
});
