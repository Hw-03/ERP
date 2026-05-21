import { describe, it, expect, vi, afterEach } from "vitest";
import { stockRequestsApi } from "../api/stock-requests";

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

describe("stockRequestsApi", () => {
  it("createStockRequest POST /api/stock-requests", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.createStockRequest({
      requester_employee_id: "e1",
      request_type: "raw_receive",
      reference_no: null,
      notes: null,
      lines: [],
    });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/stock-requests");
  });

  it("listMyStockRequests encodes employeeId", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.listMyStockRequests("E 1");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("requester_employee_id=E%201");
  });

  it("listWarehouseQueue GET /api/stock-requests/warehouse-queue", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.listWarehouseQueue();
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/stock-requests/warehouse-queue");
  });

  it("approveStockRequest POST /{id}/approve", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.approveStockRequest("r-1", { actor_employee_id: "e1", pin: "0000" });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/stock-requests/r-1/approve");
  });

  it("submitStockRequestDraft POST /{id}/submit", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.submitStockRequestDraft("r-1", "e-1");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/stock-requests/r-1/submit");
  });

  it("deleteStockRequestDraft DELETE with employeeId in query", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.deleteStockRequestDraft("r-1", "e-1");
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("/api/stock-requests/draft/r-1");
    expect(url).toContain("requester_employee_id=e-1");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("DELETE");
  });

  it("rejectStockRequest POST /{id}/reject", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.rejectStockRequest("r-1", { actor_employee_id: "e1", pin: "0000" });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/stock-requests/r-1/reject");
  });

  it("cancelStockRequest POST /{id}/cancel", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.cancelStockRequest("r-1", { actor_employee_id: "e1", pin: "0000" });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/stock-requests/r-1/cancel");
  });

  it("getItemReservations GET /reservations?item_id=", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.getItemReservations("i-1");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/stock-requests/reservations");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("item_id=i-1");
  });

  it("upsertStockRequestDraft PUT /api/stock-requests/draft", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.upsertStockRequestDraft({
      requester_employee_id: "e1",
      request_type: "raw_receive",
      reference_no: null,
      notes: null,
      lines: [],
    });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PUT");
  });

  it("getStockRequestDraft encodes both params", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(null)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.getStockRequestDraft("e-1", "raw_receive");
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("requester_employee_id=e-1");
    expect(url).toContain("request_type=raw_receive");
  });

  it("listStockRequestDrafts GET /drafts?requester_employee_id=", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.listStockRequestDrafts("e-1");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/stock-requests/drafts");
  });
});
