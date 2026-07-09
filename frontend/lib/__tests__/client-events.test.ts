import { afterEach, describe, expect, it, vi } from "vitest";

import { sendClientEvent } from "../client-events";

describe("client event logging", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.localStorage.clear();
  });

  it("sends allowed UI events with the current employee code", () => {
    window.localStorage.setItem(
      "dexcowin_mes_operator",
      JSON.stringify({ employee_id: "emp-1", name: "Kim", employee_code: "E22" }),
    );
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    sendClientEvent({ event: "ui_nav", from: "dashboard", to: "history", path: "/mes", source: "desktop" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/client-events");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      "X-MES-Employee-Code": "E22",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      event: "ui_nav",
      from: "dashboard",
      to: "history",
      path: "/mes",
      source: "desktop",
    });
  });

  it("does not throw when event delivery fails", () => {
    globalThis.fetch = vi.fn(() => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    expect(() => sendClientEvent({ event: "ui_logout", source: "desktop" })).not.toThrow();
  });
});
