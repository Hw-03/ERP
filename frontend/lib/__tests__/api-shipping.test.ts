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

  it("updates checklist and completes preparation without companion payload", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await shippingApi.updateShippingChecklist("req-1", {
      checks: [{ item_id: "item-1", checked: true }],
    });
    await shippingApi.prepareShippingComplete("req-1");

    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/shipping/requests/req-1/checklist");
    expect(String(fetchSpy.mock.calls[1][0])).toContain("/api/shipping/requests/req-1/prepare-complete");
  });

  it("lists history and filters request status", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await shippingApi.getShippingRequests({ status: "PREPARING" });
    await shippingApi.getShippingHistory();

    expect(String(fetchSpy.mock.calls[0][0])).toContain("status=PREPARING");
    expect(String(fetchSpy.mock.calls[1][0])).toContain("/api/shipping/history");
  });
});
