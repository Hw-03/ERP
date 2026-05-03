import { describe, it, expect, vi, afterEach } from "vitest";
import { operationsApi } from "../api/operations";

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

describe("operationsApi.scrap/loss/variance", () => {
  it("recordScrap POST /api/scrap/", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await operationsApi.recordScrap({ item_id: "i1", quantity: 1, reason: "test" });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/scrap/");
  });

  it("recordLoss with deduct=true → query string", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await operationsApi.recordLoss({ item_id: "i1", quantity: 1, reason: "x" }, true);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("deduct=true");
  });

  it("listVariance forwards itemId filter", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await operationsApi.listVariance({ itemId: "I-1" });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("item_id=I-1");
  });
});

describe("operationsApi.alerts", () => {
  it("scanSafetyAlerts POST /api/alerts/scan", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await operationsApi.scanSafetyAlerts();
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/alerts/scan");
  });

  it("listAlerts with kind/includeAcknowledged", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await operationsApi.listAlerts({ kind: "low_stock", includeAcknowledged: true });
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("kind=low_stock");
    expect(url).toContain("include_acknowledged=true");
  });

  it("acknowledgeAlert POST /api/alerts/{id}/acknowledge", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await operationsApi.acknowledgeAlert("a-1", "user");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/alerts/a-1/acknowledge");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string).acknowledged_by).toBe("user");
  });
});

describe("operationsApi.physicalCounts", () => {
  it("submitPhysicalCount POST /api/counts/", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await operationsApi.submitPhysicalCount({ item_id: "i1", counted_qty: 5 });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/counts/");
  });

  it("listPhysicalCounts GET /api/counts/?item_id=", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await operationsApi.listPhysicalCounts("i1");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/counts/");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("item_id=i1");
  });
});

describe("operationsApi 잔여 list 메소드", () => {
  it("listScrap GET /api/scrap/?item_id=", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await operationsApi.listScrap({ itemId: "i1" });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("item_id=i1");
  });

  it("listLoss GET /api/loss/?batch_id=", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await operationsApi.listLoss({ batchId: "b1" });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("batch_id=b1");
  });
});
