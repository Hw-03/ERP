import { describe, it, expect, vi, afterEach } from "vitest";
import { shippingApi } from "../api/shipping";

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

describe("shippingApi", () => {
  it("creates a shipping request", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await shippingApi.createShippingRequest({
      base_pf_item_id: "pf-1",
      requested_by_name: "shipping",
      request_quantity: 2,
      bom_lines: [{ parent_stage: "PA", child_item_id: "af-1", quantity: 1, unit: "EA" }],
      companion_lines: [{ item_id: "carton-1", quantity: 3, unit: "EA" }],
    });

    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/shipping/requests");
    expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe("POST");
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.request_quantity).toBe(2);
    expect(body.companion_lines).toEqual([{ item_id: "carton-1", quantity: 3, unit: "EA" }]);
  });

  it("updates checklist and sends serial numbers when completing preparation", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await shippingApi.updateShippingChecklist("req-1", {
      checks: [{ item_id: "item-1", checked: true }],
    });
    await shippingApi.prepareShippingComplete("req-1", { serial_numbers: "SN-001\nSN-002" });

    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/shipping/requests/req-1/checklist");
    expect(String(fetchSpy.mock.calls[1][0])).toContain("/api/shipping/requests/req-1/prepare-complete");
    expect(JSON.parse((fetchSpy.mock.calls[1][1] as RequestInit).body as string)).toEqual({
      serial_numbers: "SN-001\nSN-002",
    });
  });

  it("lists history and filters request status", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await shippingApi.getShippingRequests({ status: "PREPARING" });
    await shippingApi.getShippingHistory({ status: "PICKED_UP", year: 2026, month: 7, q: "INV-", cursor: "next", limit: 50 });

    expect(String(fetchSpy.mock.calls[0][0])).toContain("status=PREPARING");
    const historyUrl = String(fetchSpy.mock.calls[1][0]);
    expect(historyUrl).toContain("/api/shipping/history?");
    expect(historyUrl).toContain("status=PICKED_UP");
    expect(historyUrl).toContain("year=2026");
    expect(historyUrl).toContain("month=7");
    expect(historyUrl).toContain("q=INV-");
    expect(historyUrl).toContain("cursor=next");
    expect(historyUrl).toContain("limit=50");
  });

  it("reads one shipping request by id with an abort signal", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({ request_id: "req-old" })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const controller = new AbortController();

    await shippingApi.getShippingRequest("req-old", { signal: controller.signal });

    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/shipping/requests/req-old");
    expect(fetchSpy.mock.calls[0][1]).toEqual(expect.objectContaining({ signal: controller.signal }));
  });

  it("keeps the unfiltered history call compatible with the mobile row list", async () => {
    const rows = [{ request_id: "hist-1" }];
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({ requests: rows, next_cursor: null, has_more: false })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(shippingApi.getShippingHistory()).resolves.toEqual(rows);
  });

  it("updates invoice and reads revisions and history months", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await shippingApi.updateShippingInvoice("req-1", " inv-001 ");
    await shippingApi.getShippingRevisions("req-1");
    await shippingApi.getShippingHistoryMonths({ status: "CANCELLED", year: 2026 });

    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/shipping/requests/req-1/invoice");
    expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe("PATCH");
    expect(JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)).toEqual({ invoice_number: " inv-001 " });
    expect(String(fetchSpy.mock.calls[1][0])).toContain("/api/shipping/requests/req-1/revisions");
    expect(String(fetchSpy.mock.calls[2][0])).toContain("/api/shipping/history/months?status=CANCELLED&year=2026");
  });
});
