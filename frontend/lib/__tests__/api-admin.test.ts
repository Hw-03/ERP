import { describe, it, expect, vi, afterEach } from "vitest";
import { adminApi } from "../api/admin";

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

describe("adminApi", () => {
  it("verifyAdminPin POSTs /api/settings/verify-pin", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({ message: "ok" })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await adminApi.verifyAdminPin("0000");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/settings/verify-pin");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ pin: "0000" });
  });

  it("updateAdminPin PUT /api/settings/admin-pin", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({ message: "ok" })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await adminApi.updateAdminPin({ current_pin: "0000", new_pin: "1234" });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/settings/admin-pin");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PUT");
  });

  it("resetDatabase POST /api/settings/reset", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({ message: "reset" })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await adminApi.resetDatabase("0000");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/settings/reset");
  });
});
